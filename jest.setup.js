/* Native health modules can't load under Jest: default to "no health store". Tests override per file. */
jest.mock('@kingstinct/react-native-healthkit', () => ({
  AuthorizationRequestStatus: { unknown: 0, shouldRequest: 1, unnecessary: 2 },
  isHealthDataAvailableAsync: jest.fn(async () => false),
  getRequestStatusForAuthorization: jest.fn(async () => 1),
  requestAuthorization: jest.fn(async () => true),
  queryQuantitySamples: jest.fn(async () => []),
  queryStatisticsCollectionForQuantity: jest.fn(async () => []),
  queryWorkoutSamples: jest.fn(async () => []),
}));
jest.mock('react-native-health-connect', () => ({
  SdkAvailabilityStatus: { SDK_UNAVAILABLE: 1, SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2, SDK_AVAILABLE: 3 },
  getSdkStatus: jest.fn(async () => 1),
  initialize: jest.fn(async () => true),
  requestPermission: jest.fn(async () => []),
  getGrantedPermissions: jest.fn(async () => []),
  revokeAllPermissions: jest.fn(async () => undefined),
  readRecords: jest.fn(async () => ({ records: [] })),
  aggregateRecord: jest.fn(async () => null),
  aggregateGroupByPeriod: jest.fn(async () => []),
  openHealthConnectSettings: jest.fn(),
}));
