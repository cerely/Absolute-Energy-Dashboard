import { createAppSelector } from './selectors';
import { RootState } from '../../store';
import { selectCik } from '../api/conversionsApi';
import { GroupData } from '../../types/redux/groups';
import { SelectOption } from '../../types/items';
import { LanguageTypes } from '../../types/redux/i18n';
import { DataType } from '../../types/Datasources';

import { getMenuOptionFont, getCompatibilityChangeCase, GroupCase, setIntersect } from '../../utils/determineCompatibleUnits';
import { get } from 'lodash';
import { selectAllGroups, selectGroupDataById } from '../api/groupsApi';
import { selectAllMeters, selectMeterDataById } from '../api/metersApi';



/**
 * Selector to get compatible units for a specific unit ID.
 * @param _state The Redux state.
 * @param unitId The unit ID.
 * @returns A set of compatible unit IDs.
 */
export const selectUnitsCompatibleWithUnit = createAppSelector(
	//get all ciks
	[selectCik, (_state: RootState, unitId: number) => unitId],
	(globalCiksState, unitId) => {
		const unitSet = new Set<number>();
		// If unit was null in the database then -99. This means there is no unit
		// so nothing is compatible with it. Skip processing and return empty set at end.
		if (unitId !== -99) {
			// loop through each cik to find ones whose meterUnitId equals unitId param
			// then add the corresponding nonMeterUnitId to the unitSet
			for (const cik of globalCiksState) {
				if (cik.meterUnitId === unitId) {
					unitSet.add(cik.nonMeterUnitId);
				}
			}
		}

		return unitSet;
	}
);



//Can't call selector in selector because it relies on some data that is computed during the selector call. and also in a loop
//I tried out something else on the selectCompatibleUnits selector which is refactored from getCompatibleUnits.
//If that seems ok, I will do the same here.
/**
 * Takes a set of meter ids and returns the set of compatible unit ids.
 * @param _state the Redux state.
 * @param meters The set of meter ids.
 * @returns Set of compatible unit ids.
 */
export const selectUnitsCompatibleWithMeters = createAppSelector(
	[selectMeterDataById, (_state: RootState, meters: Set<number>) => meters],
	(meterDataByID, meters) => {
		let first = true;
		let compatibleUnits = new Set<number>();
		meters.forEach(meterId => {
			const meter = get(meterDataByID, meterId);
			let meterUnits = new Set<number>();
			if (meter && meter.unitId != -99) {
				meterUnits = selectUnitsCompatibleWithUnit(_state, meter.unitId);
			}
			if (first) {
				compatibleUnits = meterUnits;
				first = false;
			} else {
				compatibleUnits = setIntersect(compatibleUnits, meterUnits);
			}
		});
		return compatibleUnits;
	}
);

/**
 * Selector to get all meters in a group.
 * @param _state The Redux state.
 * @param groupId The group ID.
 * @returns A set of deep children in the group.
 */
export const selectMetersInGroup = createAppSelector(
	[selectGroupDataById, (_state: RootState, groupId: number) => groupId],
	(groupDataById, groupId) => {
		const group = get(groupDataById, groupId);
		return new Set(group?.deepMeters);
	}
);

/**
 * Returns array of deep meter ids of the changed group. This only works if all other groups in state
 * do not include this group.
 * @param _state The Redux state.
 * @param changedGroupState The state for the changed group
 * @returns array of deep meter ids of the changed group considering possible changes
 */
export const selectMetersInChangedGroup = createAppSelector(
	[selectGroupDataById, (_state: RootState, changedGroupState: GroupData) => changedGroupState],
	(groupDataById, changedGroupState) => {
		const deepMeters = new Set(changedGroupState.childMeters);
		changedGroupState.childGroups.forEach(group => {
			const groupState = get(groupDataById, group);
			if (groupState) {
				groupState.deepMeters.forEach(meter => deepMeters.add(meter));
			}
		});
		return Array.from(deepMeters);
	}
);

/**
 * Get options for the meter menu on the group page.
 * @param _state The Redux state.
 * @param defaultGraphicUnit The groups current default graphic unit which may have been updated from what is in Redux state.
 * @param deepMeters The groups current deep meters (all recursively) which may have been updated from what is in Redux state.
 * @param locale Current language from Redux state.
 * @returns The current meter options for this group.
 */
export const selectMeterMenuOptionsForGroup = createAppSelector(
	[
		selectAllMeters,
		selectUnitsCompatibleWithMeters,
		(_state, defaultGraphicUnit: number) => defaultGraphicUnit,
		(_state, deepMeters: number[]) => deepMeters,
		(_state, locale: LanguageTypes) => locale
	],
	(meterData, currentUnits, defaultGraphicUnit, deepMeters, locale) => {
		const options: SelectOption[] = [];
		meterData.forEach(meter => {
			const option = {
				label: meter.identifier,
				value: meter.id,
				isDisabled: false,
				style: {}
			} as SelectOption;

			const compatibilityChangeCase = getCompatibilityChangeCase(
				currentUnits,
				meter.id,
				DataType.Meter,
				defaultGraphicUnit,
				[]
			);

			if (compatibilityChangeCase === GroupCase.NoCompatibleUnits) {
				option.isDisabled = true;
			} else {
				option.style = getMenuOptionFont(compatibilityChangeCase);
			}
			options.push(option);
		});

		return options.sort((itemA, itemB) =>
			itemA.label.toLowerCase()?.localeCompare(itemB.label.toLowerCase(), String(locale), { sensitivity: 'accent' })
		);
	}
);

/**
 * Get options for the group menu on the group page.
 * @param _state The Redux state.
 * @param groupId The id of the group being worked on.
 * @param defaultGraphicUnit The group's current default graphic unit which may have been updated from what is in Redux state.
 * @param deepMeters The group's current deep meters (all recursively) which may have been updated from what is in Redux state.
 * @param locale Current language from Redux state.
 * @returns The current group options for this group.
 */
export const selectGroupMenuOptionsForGroup = createAppSelector(
	[
		selectAllGroups,
		selectUnitsCompatibleWithMeters,
		(_state, groupId: number) => groupId,
		(_state, defaultGraphicUnit: number) => defaultGraphicUnit,
		(_state, deepMeters: number[]) => deepMeters,
		(_state, locale: LanguageTypes) => locale
	],
	(groupData, currentUnits, groupId, defaultGraphicUnit, deepMeters, locale) => {
		const options: SelectOption[] = [];
		groupData.forEach(group => {
			if (group.id !== groupId) {
				const option = {
					label: group.name,
					value: group.id,
					isDisabled: false,
					style: {}
				} as SelectOption;

				const compatibilityChangeCase = getCompatibilityChangeCase(
					currentUnits,
					group.id,
					DataType.Group,
					defaultGraphicUnit,
					group.deepMeters
				);

				if (compatibilityChangeCase === GroupCase.NoCompatibleUnits) {
					option.isDisabled = true;
				} else {
					option.style = getMenuOptionFont(compatibilityChangeCase);
				}
				options.push(option);
			}
		});

		return options.sort((itemA, itemB) =>
			itemA.label.toLowerCase()?.localeCompare(itemB.label.toLowerCase(), String(locale), { sensitivity: 'accent' })
		);
	}
);
// Thoughts:
// This is an idea I was thinking that I can't seem to figure out how to call selector in a selector,
// because they seem to rely on some data that is computed during the selector call. And so I can't call selector as dependency.
// So I just recreated the logic here.
// The lint stop complaining but I just want to check in to see if there is a better way to do it.
export const selectCompatibleUnits = createAppSelector(
	[
		selectMeterDataById,
		selectCik, // Needed for selectUnitsCompatibleWithUnit logic
		(_state: RootState, id: number) => id,
		(_state: RootState, type: DataType) => type,
		(_state: RootState, deepMeters: number[]) => deepMeters
	],
	(meterDataByID, globalCiksState, id, type, deepMeters) => {
		if (type === DataType.Meter) {
			const meter = meterDataByID[id];
			if (meter) {
				// Logic for selectUnitsCompatibleWithUnit
				const unitSet = new Set<number>();
				if (meter.unitId !== -99) {
					globalCiksState.forEach(cik => {
						if (cik.meterUnitId === meter.unitId) {
							unitSet.add(cik.nonMeterUnitId);
						}
					});
				}
				return unitSet;
			}
			return new Set<number>();
		} else {
			// Logic for selectUnitsCompatibleWithMeters
			const meterUnitsMap = new Map<number, Set<number>>();
			globalCiksState.forEach(cik => {
				if (!meterUnitsMap.has(cik.meterUnitId)) {
					meterUnitsMap.set(cik.meterUnitId, new Set());
				}
				meterUnitsMap.get(cik.meterUnitId)?.add(cik.nonMeterUnitId);
			});

			let first = true;
			let compatibleUnits = new Set<number>();
			deepMeters.forEach(meterId => {
				const meter = meterDataByID[meterId];
				let meterUnits = new Set<number>();
				if (meter && meter.unitId !== -99) {
					meterUnits = meterUnitsMap.get(meter.unitId) || new Set();
				}
				if (first) {
					compatibleUnits = meterUnits;
					first = false;
				} else {
					compatibleUnits = setIntersect(compatibleUnits, meterUnits);
				}
			});
			return compatibleUnits;
		}
	}
);

