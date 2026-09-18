import { useAsync } from 'react-use';

import { getRecordingRulesTargetDataSources } from '@grafana/alerting/internal';

const EMPTY_UIDS = new Set<string>();

/**
 * The uids of the data sources allowed as recording rule targets. Empty while loading, since the
 * pickers using this treat "no match yet" the same as "not a valid target" until the fetch resolves.
 */
export function useRecordingRulesTargetUids(): Set<string> {
  const { value = EMPTY_UIDS } = useAsync(async () => {
    const dataSources = await getRecordingRulesTargetDataSources();
    return new Set(dataSources.map((ds) => ds.uid));
  }, []);

  return value;
}
