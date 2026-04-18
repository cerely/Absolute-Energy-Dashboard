/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createSelector } from '@reduxjs/toolkit';
import * as moment from 'moment';
import { BarReadings } from 'types/readings';
import { selectWidthDays, selectBarStacking } from '../../redux/slices/graphSlice';
import { DataType } from '../../types/Datasources';
import { MeterOrGroup } from '../../types/redux/graph';
import getGraphColor from '../../utils/getGraphColor';
import { createAppSelector } from './selectors';
import {
	selectNameFromEntity,
	selectScalingFromEntity
} from './entitySelectors';
import {
	selectPlotlyMeterDeps,
	selectPlotlyGroupDeps
} from './plotlyDataSelectors';
import { selectSelectedLanguage } from '../../redux/slices/appStateSlice';

type PlotlyBarDeps =
	ReturnType<typeof selectPlotlyMeterDeps> & {
		barDuration: moment.Duration;
		barStacking: boolean;
	};

export const selectPlotlyBarDeps = createAppSelector(
	[
		selectPlotlyMeterDeps,
		selectPlotlyGroupDeps,
		selectWidthDays,
		selectSelectedLanguage,
		selectBarStacking
	],
	(meterDeps, groupDeps, barDuration, locale, barStacking) => {
		const barMeterDeps = {
			...meterDeps,
			barDuration,
			barStacking,
			needsRateScaling: false,
			rateScaling: 1
		};
		const barGroupDeps = {
			...groupDeps,
			barDuration,
			barStacking,
			needsRateScaling: false,
			rateScaling: 1
		};
		return { barMeterDeps, barGroupDeps };
	}
);

// Selector that derives meter data for the bar graphic
export const selectPlotlyBarDataFromResult =
	createSelector.withTypes<BarReadings>()(
		[
			data => data,
			(_data, dependencies: PlotlyBarDeps) => dependencies
		],
		(
			data,
			{
				areaNormalization,
				compatibleEntities,
				meterDataById,
				groupDataById,
				meterOrGroup,
				barDuration,
				barUnitLabel,
				areaUnit,
				barStacking
			}
		) => {
			const validEntries = Object.entries(data)
				.filter(([id]) => compatibleEntities.includes(Number(id)));

			const plotlyData: Partial<Plotly.PlotData>[] = validEntries
				.map(([id, readings], index) => {
					const entityId = Number(id);
					const entity =
						meterOrGroup === MeterOrGroup.meters
							? meterDataById[entityId]
							: groupDataById[entityId];

					const scaling = selectScalingFromEntity(
						entity,
						areaUnit,
						areaNormalization,
						1
					);

					const label =
						selectNameFromEntity(entity) +
						(meterOrGroup === MeterOrGroup.meters
							? 'ᴹ'
							: meterOrGroup === MeterOrGroup.groups
								? 'ᴳ'
								: '');

					const colorID = entity.id;

					const xData: string[] = [];
					const yData: number[] = [];
					const hoverText: string[] = [];

					const allReadings = validEntries.flatMap(([_id, r]) => r);
					let minDurationMs = barDuration.asMilliseconds();

					if (allReadings.length > 0) {
						// Calculate minimum duration from actual data points
						const durations = allReadings.map(r =>
							moment(r.endTimestamp).valueOf() - moment(r.startTimestamp).valueOf()
						);
						const minReadingDuration = Math.min(...durations);
						if (minReadingDuration > 0 && minReadingDuration < minDurationMs) {
							minDurationMs = minReadingDuration;
						}
					}

					// Let Plotly calculate trace width natively using bargap and bargroupgap

					readings.forEach(barReading => {
						const start = moment.utc(barReading.startTimestamp);

						// Center the data point perfectly inside the duration bucket so that 
						// grouped bars do not straddle past the starting boundaries.
						const center = moment.utc(start).add(minDurationMs / 2, 'milliseconds');
						xData.push(center.format('YYYY-MM-DD HH:mm:ss'));

						const readingValue =
							barReading.reading * scaling;
						yData.push(readingValue);

						const readingDuration = moment(barReading.endTimestamp).diff(start);
						let timeRange: string;

						if (readingDuration < 86400000) {
							const end = moment.utc(barReading.endTimestamp);
							timeRange = `${start.format('ll LT')} - ${end.format('LT')}`;
						} else {
							timeRange = start.format('ll');
							if (moment.duration(readingDuration).asDays() > 1.1) {
								timeRange += ` - ${moment
									.utc(barReading.endTimestamp)
									.subtract(1, 'days')
									.format('ll')}`;
							}
						}

						const formatted = Number(readingValue).toLocaleString(
							undefined,
							{ maximumFractionDigits: 6 }
						);

						hoverText.push(
							`<b>${timeRange}</b><br>${label}: ${formatted} ${barUnitLabel}`
						);
					});

					return {
						name: label,
						x: xData,
						y: yData,
						text: hoverText,
						hoverinfo: 'text',
						type: 'bar',
						marker: {
							color: getGraphColor(colorID, DataType.Meter)
						}
					};
				});

			return plotlyData;
		}
	);
