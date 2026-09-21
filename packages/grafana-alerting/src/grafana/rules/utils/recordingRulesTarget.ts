import {
  type DataSourceInstanceListItem,
  type DataSourceInstanceSettings,
  type DataSourceJsonData,
} from '@grafana/data';
import { getDataSourceInstanceList, getDataSourceInstanceSettings } from '@grafana/plugin-compat/datasources';

export const SUPPORTED_EXTERNAL_PROMETHEUS_FLAVORED_RULE_SOURCE_TYPES = [
  'prometheus',
  'grafana-amazonprometheus-datasource',
  'grafana-azureprometheus-datasource',
] as const;

export type SupportedExternalPrometheusFlavoredRulesSourceType =
  (typeof SUPPORTED_EXTERNAL_PROMETHEUS_FLAVORED_RULE_SOURCE_TYPES)[number];

/**
 * Check if the given type is a supported external Prometheus flavored rules source type.
 */
export function isSupportedExternalPrometheusFlavoredRulesSourceType(
  type: string
): type is SupportedExternalPrometheusFlavoredRulesSourceType {
  return SUPPORTED_EXTERNAL_PROMETHEUS_FLAVORED_RULE_SOURCE_TYPES.find((t) => t === type) !== undefined;
}

export function isDataSourceAllowedAsRecordingRulesTarget(ds: DataSourceInstanceSettings<DataSourceJsonData>) {
  return ds.jsonData.allowAsRecordingRulesTarget !== false; // if this prop is undefined it defaults to true
}

export function isValidRecordingRulesTarget(ds: DataSourceInstanceSettings<DataSourceJsonData>): boolean {
  return isSupportedExternalPrometheusFlavoredRulesSourceType(ds.type) && isDataSourceAllowedAsRecordingRulesTarget(ds);
}

/**
 * The data sources allowed as recording rule targets. Callers should test membership by `uid` —
 * the list items don't carry `jsonData`, which is only needed internally to compute this list.
 */
export async function getRecordingRulesTargetDataSources(): Promise<DataSourceInstanceListItem[]> {
  const candidates = await getDataSourceInstanceList({
    type: [...SUPPORTED_EXTERNAL_PROMETHEUS_FLAVORED_RULE_SOURCE_TYPES],
    all: true,
  });

  const settingsByUid = await Promise.all(candidates.map((item) => getDataSourceInstanceSettings(item.uid)));

  return candidates.filter((_, index) => {
    const settings = settingsByUid[index];
    return settings ? isDataSourceAllowedAsRecordingRulesTarget(settings) : true;
  });
}
