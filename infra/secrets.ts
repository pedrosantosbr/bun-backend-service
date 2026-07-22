/**
 * All deploy-time secrets. Set values per stage with:
 *   bun sst secret set PostgresUrl "postgres://..." --stage staging
 */
export const postgresUrl = new sst.Secret("PostgresUrl");
export const mongoUrl = new sst.Secret("MongoUrl");
export const echoProviderApiKey = new sst.Secret("EchoProviderApiKey");
export const echoProviderBaseUrl = new sst.Secret("EchoProviderBaseUrl");
export const apiToken = new sst.Secret("ApiToken");
