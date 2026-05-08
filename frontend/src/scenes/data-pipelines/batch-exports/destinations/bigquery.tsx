import { useValues } from 'kea'

import { IconInfo } from '@posthog/icons'
import { LemonCheckbox, LemonFileInput, LemonInput, Tooltip } from '@posthog/lemon-ui'

import { IntegrationChoice } from 'lib/components/CyclotronJob/integrations/IntegrationChoice'
import { FEATURE_FLAGS } from 'lib/constants'
import { LemonField } from 'lib/lemon-ui/LemonField'
import { featureFlagLogic } from 'lib/logic/featureFlagLogic'

import type { DestinationDefinition } from './types'

export const bigqueryDefinition: DestinationDefinition = {
    type: 'BigQuery',
    usesIntegration: true,
    defaults: () => ({}),
    requiredFields: ({ isNew, featureFlags }) => [
        ...(isNew && !featureFlags[FEATURE_FLAGS.BATCH_EXPORTS_BIGQUERY_INTEGRATION] ? ['json_config_file'] : []),
        ...(isNew && featureFlags[FEATURE_FLAGS.BATCH_EXPORTS_BIGQUERY_INTEGRATION] ? ['integration_id'] : []),
        'dataset_id',
        'table_id',
    ],
    // BigQuery's service-account JSON upload writes parsed fields back into the form.
    // Hooked into the form logic's setConfigurationValue listener via the registry.
    onFieldChange: async (field, value, ctx) => {
        if (field !== 'json_config_file' || !value) {
            return
        }
        try {
            const loadedFile: string = await new Promise((resolve, reject) => {
                const filereader = new FileReader()
                filereader.onload = (e) => resolve(e.target?.result as string)
                filereader.onerror = (e) => reject(e)
                filereader.readAsText(value[0])
            })
            const jsonConfig = JSON.parse(loadedFile)
            const { json_config_file: _, ...remainingConfig } = ctx.current
            ctx.setValues({
                ...remainingConfig,
                project_id: jsonConfig.project_id,
                private_key: jsonConfig.private_key,
                private_key_id: jsonConfig.private_key_id,
                client_email: jsonConfig.client_email,
                token_uri: jsonConfig.token_uri,
            })
        } catch {
            ctx.setManualErrors({ json_config_file: 'The config file is not valid' })
        }
    },
    eventTableOverrides: { teamIdHogql: 'team_id' },
    eventTableExtraFields: {
        bq_ingested_timestamp: {
            name: 'bq_ingested_timestamp',
            hogql_value: 'NOW64()',
            type: 'datetime',
            schema_valid: true,
        },
    },
    Fields: function BigQueryFields({ isNew }) {
        const { featureFlags } = useValues(featureFlagLogic)
        const bigQueryIntegrationEnabled = featureFlags[FEATURE_FLAGS.BATCH_EXPORTS_BIGQUERY_INTEGRATION]

        return (
            <>
                {bigQueryIntegrationEnabled ? (
                    <LemonField name="integration_id" label="Integration">
                        {({ value, onChange }) => (
                            <IntegrationChoice
                                integration="google-cloud-service-account"
                                value={value}
                                onChange={onChange}
                            />
                        )}
                    </LemonField>
                ) : (
                    <LemonField name="json_config_file" label="Google Cloud JSON key file">
                        <LemonFileInput accept=".json" multiple={false} />
                    </LemonField>
                )}

                <LemonField name="table_id" label="Table ID">
                    <LemonInput placeholder="events" />
                </LemonField>

                <LemonField name="dataset_id" label="Dataset ID">
                    <LemonInput placeholder="dataset" />
                </LemonField>

                {isNew ? (
                    <LemonField name="use_json_type" label="Structured fields data type">
                        <LemonCheckbox
                            bordered
                            label={
                                <span className="flex gap-2 items-center">
                                    Export 'properties', 'set', and 'set_once' fields as BigQuery JSON type
                                    <Tooltip title="If left unchecked, these fields will be sent as STRING type. This setting cannot be changed after batch export is created.">
                                        <IconInfo className="text-lg text-secondary" />
                                    </Tooltip>
                                </span>
                            }
                        />
                    </LemonField>
                ) : null}
            </>
        )
    },
}
