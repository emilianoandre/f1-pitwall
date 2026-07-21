// Minimal ambient declaration covering only the API surface this repo
// actually calls. @types/newrelic on DefinitelyTyped lags well behind the
// npm package (9.x types vs. the 14.x agent we install), so a small local
// declaration matching our real usage is more trustworthy than a stale one.
declare module "newrelic" {
  interface NewRelicApi {
    recordMetric(name: string, value: number): void;
    addCustomAttribute(key: string, value: string | number | boolean): void;
    noticeError(error: Error, customAttributes?: Record<string, unknown>): void;
  }
  const newrelic: NewRelicApi;
  export default newrelic;
}
