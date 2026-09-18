import { type DataSourceInstanceListItem, type DataSourceInstanceSettings, type DataSourceJsonData } from '@grafana/data';
import { getDataSourceInstanceList, getDataSourceInstanceSettings } from '@grafana/plugin-compat/datasources';

import {
  SUPPORTED_EXTERNAL_PROMETHEUS_FLAVORED_RULE_SOURCE_TYPES,
  getRecordingRulesTargetDataSources,
  isValidRecordingRulesTarget,
} from './recordingRulesTarget';

jest.mock('@grafana/plugin-compat/datasources', () => ({
  getDataSourceInstanceList: jest.fn(),
  getDataSourceInstanceSettings: jest.fn(),
}));

const mockGetDataSourceInstanceList = jest.mocked(getDataSourceInstanceList);
const mockGetDataSourceInstanceSettings = jest.mocked(getDataSourceInstanceSettings);

function mockDataSource(
  partial: Partial<DataSourceInstanceSettings<DataSourceJsonData>> = {}
): DataSourceInstanceSettings<DataSourceJsonData> {
  return {
    id: 1,
    uid: 'mock-ds',
    type: 'prometheus',
    name: 'Prometheus',
    access: 'proxy',
    url: '/api/datasources/proxy/uid/mock-ds',
    jsonData: {},
    meta: {} as DataSourceInstanceSettings['meta'],
    readOnly: false,
    ...partial,
  };
}

describe('isValidRecordingRulesTarget', () => {
  it.each(SUPPORTED_EXTERNAL_PROMETHEUS_FLAVORED_RULE_SOURCE_TYPES)(
    'should return true for %s datasource with allowAsRecordingRulesTarget enabled',
    (type) => {
      expect(
        isValidRecordingRulesTarget(
          mockDataSource({
            type,
            jsonData: {
              allowAsRecordingRulesTarget: true,
            },
          })
        )
      ).toBe(true);
    }
  );

  it.each(SUPPORTED_EXTERNAL_PROMETHEUS_FLAVORED_RULE_SOURCE_TYPES)(
    'should return true for %s datasource when allowAsRecordingRulesTarget is undefined (defaults to true)',
    (type) => {
      expect(
        isValidRecordingRulesTarget(
          mockDataSource({
            type,
            jsonData: {},
          })
        )
      ).toBe(true);
    }
  );

  it.each(SUPPORTED_EXTERNAL_PROMETHEUS_FLAVORED_RULE_SOURCE_TYPES)(
    'should return false for %s datasource with allowAsRecordingRulesTarget disabled',
    (type) => {
      expect(
        isValidRecordingRulesTarget(
          mockDataSource({
            type,
            jsonData: {
              allowAsRecordingRulesTarget: false,
            },
          })
        )
      ).toBe(false);
    }
  );

  it('should return false for loki datasource (unsupported type)', () => {
    expect(
      isValidRecordingRulesTarget(
        mockDataSource({
          type: 'loki',
          jsonData: {
            allowAsRecordingRulesTarget: true,
          },
        })
      )
    ).toBe(false);
  });
});

function mockListItem(partial: Partial<DataSourceInstanceListItem> = {}): DataSourceInstanceListItem {
  return {
    uid: 'mock-ds',
    type: 'prometheus',
    name: 'Prometheus',
    meta: {} as DataSourceInstanceListItem['meta'],
    isDefault: false,
    ...partial,
  };
}

describe('getRecordingRulesTargetDataSources', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('excludes a data source with allowAsRecordingRulesTarget disabled', async () => {
    const allowed = mockListItem({ uid: 'allowed' });
    const disallowed = mockListItem({ uid: 'disallowed' });
    mockGetDataSourceInstanceList.mockResolvedValue([allowed, disallowed]);
    mockGetDataSourceInstanceSettings.mockImplementation(async (uid) =>
      mockDataSource({ uid: String(uid), jsonData: { allowAsRecordingRulesTarget: uid !== 'disallowed' } })
    );

    const result = await getRecordingRulesTargetDataSources();

    expect(result.map((ds) => ds.uid)).toEqual(['allowed']);
  });

  it('includes a data source when allowAsRecordingRulesTarget is undefined', async () => {
    const item = mockListItem();
    mockGetDataSourceInstanceList.mockResolvedValue([item]);
    mockGetDataSourceInstanceSettings.mockResolvedValue(mockDataSource({ jsonData: {} }));

    const result = await getRecordingRulesTargetDataSources();

    expect(result).toEqual([item]);
  });

  it('queries only the supported Prometheus-flavored types', async () => {
    mockGetDataSourceInstanceList.mockResolvedValue([]);

    await getRecordingRulesTargetDataSources();

    expect(mockGetDataSourceInstanceList).toHaveBeenCalledWith({
      type: [...SUPPORTED_EXTERNAL_PROMETHEUS_FLAVORED_RULE_SOURCE_TYPES],
      all: true,
    });
  });
});
