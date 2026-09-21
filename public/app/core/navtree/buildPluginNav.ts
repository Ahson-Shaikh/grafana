import { cloneDeep, isUndefined, omitBy } from 'lodash';

import {
  type AppPluginConfig,
  isIconName,
  type NavModelItem,
  type PluginInclude,
  PluginIncludeType,
} from '@grafana/data';
import { config } from '@grafana/runtime';
import { contextSrv } from 'app/core/services/context_srv';
import { AccessControlAction } from 'app/types/accessControl';

import { appNavConfigFor } from './appNavConfig';
import { buildStaticNavTree } from './buildStaticNavTree';
import { NavID, NavWeight, PLUGIN_SECTION_SHELLS } from './constants';
import { appendIntoSection, applyAppSubUrl, pluginPageId, pruneEmptyNavSections, sortNavTree } from './utils';

/**
 * Merges app-plugin nav items into the client-built tree and returns a new
 * tree. The Go equivalent is addAppLinks in
 * pkg/services/navtree/navtreeimpl/applinks.go.
 *
 * Apps are placed in the section their nav config names, falling back to
 * "More apps" under their own plugin.json name.
 *
 * Permanent divergences from the Go builder: per-org plugin enablement is not
 * readable client-side, and nor is the assistant's jsonData gating beyond the
 * deployment-mode half reproduced in APP_NAV_CONFIG; includes are appended flat
 * rather than nested under their path ancestor; and page includes with no path
 * have no URL to link to.
 */
export function mergePluginNavIntoTree(apps: AppPluginConfig[]): NavModelItem[] {
  // Build a fresh static tree rather than merging into the current slice
  // state, so a re-merge cannot duplicate plugin items. Runtime-filled
  // containers are carried over separately by carryOverRuntimeChildren.
  let tree = buildStaticNavTree();

  if (contextSrv.hasPermission(AccessControlAction.PluginsAppAccess)) {
    for (const app of apps) {
      try {
        tree = addAppToTree(tree, app);
      } catch (error) {
        console.warn('[navtree] failed to build nav for app plugin', app.id, error);
      }
    }
  }

  return applyAppSubUrl(sortNavTree(pruneEmptyNavSections(tree)));
}

/**
 * Builds the nav items for one app plugin and returns a new tree with the app
 * link placed into its section.
 */
function addAppToTree(tree: NavModelItem[], app: AppPluginConfig): NavModelItem[] {
  const { appLink, hasAccessiblePages } = buildAppLink(app);

  // A `singlePage` app's only page folds into the app link itself, leaving it
  // childless; it is still placed (as a leaf) as long as the page passed its
  // access checks. Any other childless app is not part of the nav tree.
  const placeAsLeaf = Boolean(appNavConfigFor(app.id)?.singlePage) && hasAccessiblePages;
  if ((appLink.children ?? []).length === 0 && !placeAsLeaf) {
    return tree;
  }

  const link = placeAsLeaf ? { ...appLink, isSection: false } : appLink;
  return placeAppInSection(tree, app, withAppNavConfig(app, link));
}

/** Builds the app's nav link from its page and dashboard includes */
function buildAppLink(app: AppPluginConfig): { appLink: NavModelItem; hasAccessiblePages: boolean } {
  let appUrl = `/a/${app.id}`;
  let hasAccessiblePages = false;
  const children: NavModelItem[] = [];
  const filterInclude = appNavConfigFor(app.id)?.filterInclude;

  for (const include of app.includes ?? []) {
    if (!hasAccessToInclude(include) || (filterInclude && !filterInclude(include))) {
      continue;
    }

    if (include.type === PluginIncludeType.dashboard) {
      if (include.addToNav && include.uid) {
        children.push({
          url: `/d/${include.uid}`,
          text: include.name,
          pluginId: app.id,
        });
      }
      continue;
    }

    // Pathless page includes are component pages: no URL to link to
    if (include.type !== PluginIncludeType.page || !include.path) {
      continue;
    }
    hasAccessiblePages = true;

    if (include.defaultNav && include.addToNav) {
      appUrl = include.path;
    }

    if (include.addToNav) {
      children.push({
        text: include.name,
        icon: toIconName(include.icon),
        pluginId: app.id,
        url: include.path,
      });
    }
  }

  return {
    appLink: {
      text: app.name ?? app.id,
      id: pluginPageId(app.id),
      img: app.info?.logos?.small,
      subTitle: app.info?.description,
      sortWeight: NavWeight.plugin,
      isSection: true,
      pluginId: app.id,
      url: appUrl,
      // Children matching the app default nav are folded into the app link itself
      children: children.filter((child) => child.url !== appUrl),
    },
    hasAccessiblePages,
  };
}

/** Applies the app's built-in nav config: placement, weight and display overrides */
function withAppNavConfig(app: AppPluginConfig, appLink: NavModelItem): NavModelItem {
  const navConfig = appNavConfigFor(app.id);
  if (!navConfig) {
    return appLink;
  }
  const { sortWeight, text, subTitle, isNew, icon } = navConfig;
  return {
    ...appLink,
    sortWeight,
    // Absent overrides must not clobber the plugin's own values with undefined
    ...omitBy({ text, subTitle, isNew }, isUndefined),
    ...(icon && { icon: toIconName(icon) }),
  };
}

/**
 * Places the app link into its configured section (default "More apps"),
 * creating the section from its shell if this is the first app targeting it.
 * Returns a new tree.
 */
function placeAppInSection(tree: NavModelItem[], app: AppPluginConfig, appLink: NavModelItem): NavModelItem[] {
  const navConfig = appNavConfigFor(app.id);
  const sectionId = navConfig?.sectionId ?? NavID.apps;

  const sectionChildren = [appLink];

  const placed = appendIntoSection(tree, sectionId, sectionChildren);
  if (placed) {
    return placed;
  }

  const shellConfig = PLUGIN_SECTION_SHELLS[sectionId];
  if (!shellConfig) {
    console.warn('[navtree] plugin app nav id not found', app.id, sectionId);
    return tree;
  }
  const { shell, absorbs = [], imgFromAppLogo } = shellConfig;

  // Core sections the shell absorbs (e.g. Alerting into Alerts & IRM) move
  // from the top level into the new section, at their configured weight
  const absorbed = absorbs
    .map(({ id, sortWeight }) => {
      const node = tree.find((candidate) => candidate.id === id);
      return node && { ...node, sortWeight };
    })
    .filter((node) => node !== undefined);
  const absorbedIds = new Set(absorbed.map((node) => node.id));

  return [
    ...tree.filter((node) => !absorbedIds.has(node.id)),
    {
      ...shell,
      children: [...absorbed, ...sectionChildren],
      ...(imgFromAppLogo && app.info?.logos && { img: config.appSubUrl + app.info.logos.large }),
    },
  ];
}

/**
 * The starred and bookmarks containers are filled at runtime, so a freshly
 * built tree has them empty; their children are copied over from the tree in
 * the store. Applied by the dispatcher (useNavTree), which keeps
 * mergePluginNavIntoTree a pure function of the plugin metas.
 */
export function carryOverRuntimeChildren(tree: NavModelItem[], currentTree: NavModelItem[]): NavModelItem[] {
  return [NavID.starred, NavID.bookmarks].reduce((acc, id) => {
    const current = currentTree.find((node) => node.id === id);
    if (!current?.children?.length) {
      return acc;
    }
    return acc.map((node) => (node.id === id ? { ...node, children: cloneDeep(current.children) } : node));
  }, tree);
}

// Whether the user may see one of an app's pages. An include declaring an RBAC
// action is gated on that action; otherwise the user's org role must rank at or
// above the include's role. The action is evaluated unscoped: the frontend
// permissions map flattens scopes away, so the per-plugin scope the server
// applies (plugins:id:*) cannot be checked here.
function hasAccessToInclude(include: PluginInclude): boolean {
  const ORG_ROLE_RANK: Record<string, number> = { None: 0, Viewer: 1, Editor: 2, Admin: 3 };

  if (include.action) {
    return contextSrv.hasPermission(include.action);
  }
  const requiredRank = ORG_ROLE_RANK[include.role ?? 'Viewer'] ?? ORG_ROLE_RANK.Viewer;
  const userRank = ORG_ROLE_RANK[contextSrv.user.orgRole ?? ''] ?? 0;
  return userRank >= requiredRank;
}

function toIconName(icon: string | undefined): NavModelItem['icon'] {
  return isIconName(icon) ? icon : undefined;
}
