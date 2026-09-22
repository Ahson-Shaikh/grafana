import { useAsync } from 'react-use';

import { getRecordingRulesTargetDataSources } from '@grafana/alerting/unstable';
import { type DataSourceInstanceListItem } from '@grafana/data';

const EMPTY_MAP = new Map<string, DataSourceInstanceListItem>();

/**
 * The data sources allowed as recording rule targets, keyed by uid. Empty while loading, since the
 * pickers using this treat "no match yet" the same as "not a valid target" until the fetch resolves.
 */
export function useRecordingRulesTargetDataSourcesByUid(): Map<string, DataSourceInstanceListItem> {
  const { value = EMPTY_MAP } = useAsync(async () => {
    const dataSources = await getRecordingRulesTargetDataSources();
    return new Map(dataSources.map((ds) => [ds.uid, ds]));
  }, []);

  return value;
}
