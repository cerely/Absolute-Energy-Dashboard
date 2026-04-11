/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { EntityState, createEntityAdapter, createSelector } from '@reduxjs/toolkit';
import { NamedIDItem } from 'types/items';
import { RawReadings } from 'types/readings';
import { TimeInterval } from '../../../../common/TimeInterval';
import { RootState } from '../../store';
import { MeterData } from '../../types/redux/meters';
import { durationFormat } from '../../utils/durationFormat';
import { baseApi } from './baseApi';
import { conversionsApi } from './conversionsApi';

export const meterAdapter = createEntityAdapter<MeterData>({
	sortComparer: (meterA, meterB) => meterA.identifier?.localeCompare(meterB.identifier, undefined, { sensitivity: 'accent' })

});
export const metersInitialState = meterAdapter.getInitialState();
export type MeterDataState = EntityState<MeterData, number>;

// Type for the active MQTT source response
interface ActiveMqttSource {
	id: number;
	broker_url: string;
	topic: string;
	client_id: string;
	username: string;
	password: string;
	filters: string;
}

export const metersApi = baseApi.injectEndpoints({
	endpoints: builder => ({
		getMeters: builder.query<MeterDataState, void>({
			query: () => 'api/meters',
			// Optional endpoint property that can transform incoming api responses if needed
			// Use EntityAdapters from RTK to normalizeData, and generate commonSelectors
			transformResponse: (response: MeterData[]) => {
				return meterAdapter.setAll(metersInitialState, response.map(meter => ({
					...meter,
					readingFrequency: durationFormat(meter.readingFrequency)
				})));
			},
			// Tags used for invalidation by mutation requests.
			providesTags: ['MeterData']
		}),
		// Fetch the currently active MQTT source so the client can filter meters by topic
		getActiveMqttSource: builder.query<ActiveMqttSource | null, void>({
			query: () => 'api/mqtt/active',
			providesTags: ['ActiveMqttSource']
		}),
		editMeter: builder.mutation<MeterData, { meterData: MeterData, shouldRefreshViews: boolean }>({
			query: ({ meterData }) => ({
				url: 'api/meters/edit',
				method: 'POST',
				body: { ...meterData }
			}),
			onQueryStarted: async ({ meterData, shouldRefreshViews }, { dispatch, queryFulfilled }) => {
				queryFulfilled.then(() => {
					// Update reading views if needed. Never redoCik so false.
					dispatch(conversionsApi.endpoints.refresh.initiate({ redoCik: false, refreshReadingViews: shouldRefreshViews }));
					dispatch(metersApi.util.updateQueryData('getMeters', undefined, cacheDraft => { meterAdapter.addOne(cacheDraft, meterData); }));

				});
			},
			invalidatesTags: ['MeterData']
		}),
		addMeter: builder.mutation<MeterData, MeterData>({
			query: meter => ({
				url: 'api/meters/addMeter',
				method: 'POST',
				body: { ...meter }
			}),
			transformResponse: (data: MeterData) => ({ ...data, readingFrequency: durationFormat(data.readingFrequency) }),
			onQueryStarted: (_arg, { dispatch, queryFulfilled }) => {
				queryFulfilled.then(({ data }) => {
					dispatch(metersApi.util.updateQueryData('getMeters', undefined, cacheDraft => { meterAdapter.addOne(cacheDraft, data); }));
				});
			}
		}),
		lineReadingsCount: builder.query<number, { meterIDs: number[], timeInterval: TimeInterval }>({
			query: ({ meterIDs, timeInterval }) => `api/readings/line/count/meters/${meterIDs.join(',')}?timeInterval=${timeInterval.toString()}`
		}),
		details: builder.query<NamedIDItem[], void>({
			query: () => 'api/meters'
		}),
		rawLineReadings: builder.query<RawReadings[], { meterID: number, timeInterval: TimeInterval }>({
			query: ({ meterID, timeInterval }) => `api/readings/line/raw/meter/${meterID}?timeInterval=${timeInterval.toString()}`
		})
	})
});


// Export auto-generated RTK Query hooks
export const {
	useGetMetersQuery,
	useGetActiveMqttSourceQuery
} = metersApi;

export const selectMeterDataResult = metersApi.endpoints.getMeters.select();

export const {
	selectAll: selectAllMeters,
	selectById: selectMeterById,
	selectTotal: selectMeterTotal,
	selectIds: selectMeterIds,
	selectEntities: selectMeterDataById
} = meterAdapter.getSelectors((state: RootState) => selectMeterDataResult(state).data ?? metersInitialState);

// Memoized selector: active MQTT source ID (null = no MQTT configured)
// Uses createSelector so it only recomputes when the RTK Query cache changes.
export const selectActiveMqttSourceId = createSelector(
	(state: RootState) => metersApi.endpoints.getActiveMqttSource.select()(state).data,
	(activeMqttSource) => activeMqttSource?.id ?? null
);

// Memoized selector: meters filtered to only those belonging to the active MQTT source.
// - Returns ALL meters if no active source is known (MQTT not configured).
// - Returns meters where mqttSourceId matches the active source, or is null (non-MQTT meters).
// MUST be a memoized createSelector — plain functions calling .filter() return a new
// array reference every render, which causes infinite re-render loops via reselect.
export const selectActiveSourceMeters = createSelector(
	selectAllMeters,
	selectActiveMqttSourceId,
	(allMeters, activeSourceId) => {
		// Only consider meters that are enabled
		const enabledMeters = allMeters.filter(m => m.enabled);
		
		// If there is no active MQTT source (either none configured or all disabled),
		// we should only show manually created meters (mqttSourceId === null).
		if (activeSourceId === null) {
			return enabledMeters.filter(m => m.mqttSourceId === null);
		}
		
		return enabledMeters.filter(m => m.mqttSourceId === null || m.mqttSourceId === activeSourceId);
	}

);

/**
 * Selects the name of the meter associated with a given meter ID from the Redux state.
 * @param state - The current state of the Redux store.
 * @param meterID - The unique identifier for the meter.
 * @returns The name of the specified meter or an empty string if not found.
 * @example
 * const meterName = useAppSelector(state => selectMeterNameById(state, 42))
 */
export const selectMeterNameById = (state: RootState, meterID: number) => {
	const meterInfo = selectMeterById(state, meterID);
	return meterInfo ? meterInfo.name : '';
};

/**
 * Selects the identifier (not the meter ID) of the meter associated with a given meter ID from the Redux state.
 * @param state - The current state of the Redux store.
 * @param meterID - The unique identifier for the meter.
 * @returns The identifier for the specified meter or an empty string if not found.
 * @example
 * const meterIdentifier = useAppSelector(state => selectMeterIdentifierById(state, 42))
 */
export const selectMeterIdentifierById = (state: RootState, meterID: number) => {
	const meterInfo = selectMeterById(state, meterID);
	return meterInfo ? meterInfo.identifier : '';
};
