/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import Select, {
	ActionMeta, MultiValue, SingleValue,
	MultiValueGenericProps, MultiValueProps,
	StylesConfig, components
} from 'react-select';
import makeAnimated from 'react-select/animated';
import ReactTooltip from 'react-tooltip';
import { Badge } from 'reactstrap';
import { useAppDispatch, useAppSelector } from '../redux/reduxHooks';
import { selectMeterGroupSelectData } from '../redux/selectors/uiSelectors';
import {
	selectChartToRender, selectSelectedUnit, updateSelectedMeters, updateThreeDMeterOrGroupInfo,
	updateSelectedGroups, updateSelectedUnit, setLastAddedMeterOrGroup
} from '../redux/slices/graphSlice';
import { GroupedOption, SelectOption } from '../types/items';
import { ChartTypes, MeterOrGroup } from '../types/redux/graph';
import { useTranslate } from '../redux/componentHooks';
import TooltipMarkerComponent from './TooltipMarkerComponent';
import { selectAnythingFetching } from '../redux/selectors/apiSelectors';
import { selectActiveSourceMeters, useGetActiveMqttSourceQuery } from '../redux/api/metersApi';


import { getDeviceFromIdentifier } from '../utils/meterUtils';


interface DeviceOption {
	label: string;
	value: string;
}

/**
 * Creates a React-Select component for the UI Options Panel.
 * Now includes a Device dropdown that filters telemetry (meters) by device.
 * @returns A React-Select component.
 */
export default function MeterAndGroupSelectComponent() {
	const translate = useTranslate();
	const dispatch = useAppDispatch();
	const { meterGroupedOptions, groupsGroupedOptions, allSelectedMeterValues, allSelectedGroupValues } = useAppSelector(selectMeterGroupSelectData);
	const selectedUnit = useAppSelector(selectSelectedUnit);
	const somethingIsFetching = useAppSelector(selectAnythingFetching);
	// Use active-source-filtered meters so device dropdown only shows devices for the active MQTT topic
	const activeSourceMeters = useAppSelector(selectActiveSourceMeters);

	// Subscribe to active MQTT source so filtering updates when the topic is switched
	const { data: activeMqttSource } = useGetActiveMqttSourceQuery();

	// Track selected device(s)
	const [selectedDevices, setSelectedDevices] = React.useState<string[]>([]);

	// Clear device selection when the active MQTT topic changes (context switch)
	React.useEffect(() => {
		setSelectedDevices([]);
	}, [activeMqttSource?.id]);

	// Build device options from active-source meter identifiers only
	const deviceOptions = React.useMemo<DeviceOption[]>(() => {
		const deviceSet = new Set<string>();
		activeSourceMeters.forEach(meter => {
			const device = getDeviceFromIdentifier(meter.identifier);
			deviceSet.add(device);
		});
		return Array.from(deviceSet)
			.sort((a, b) => a.localeCompare(b))
			.map(device => ({ label: device, value: device }));
	}, [activeSourceMeters]);

	// Filter meter options based on selected device(s)
	const filterOptionsByDevice = React.useCallback((options: SelectOption[]): SelectOption[] => {
		if (selectedDevices.length === 0) return options;
		return options.filter(option => {
			// Find the meter data to get the identifier
			const meter = activeSourceMeters.find(m => m.id === option.value);
			if (!meter) return true; // Keep if we can't find the meter (e.g., it's a group)
			const device = getDeviceFromIdentifier(meter.identifier);
			return selectedDevices.includes(device);
		});
	}, [selectedDevices, activeSourceMeters]);


	// Merge meterGroupedOptions and groupsGroupedOptions into a single list with two categories
	// Apply device filter to meter options
	const combinedOptions = React.useMemo(() => {
		const compatibleMeters = meterGroupedOptions.find(group => group.label === 'Meters')?.options || [];
		const incompatibleMeters = meterGroupedOptions.find(group => group.label === 'Incompatible Meters')?.options || [];
		const compatibleGroups = groupsGroupedOptions.find(group => group.label === 'Options')?.options || [];
		const incompatibleGroups = groupsGroupedOptions.find(group => group.label === 'Incompatible Options')?.options || [];

		// Filter meters by selected device
		const filteredCompatibleMeters = filterOptionsByDevice(compatibleMeters);
		const filteredIncompatibleMeters = filterOptionsByDevice(incompatibleMeters);

		return [
			{
				label: 'Options', // Category name
				options: [
					// Compatible meters with "ᵐ" added to the label
					...filteredCompatibleMeters.map(option => ({
						...option,
						label: `${option.label}ᴹ`
					})),
					// Compatible groups with "ᶢ" added to the label
					...compatibleGroups.map(option => ({
						...option,
						label: `${option.label}ᴳ`
					}))
				].sort((a, b) => a.label.localeCompare(b.label)) //Sort alphabetically by label
			},
			{
				label: 'Incompatible Options',
				options: [
					// Incompatible meters with "ᵐ" added to the label
					...filteredIncompatibleMeters.map(option => ({
						...option,
						label: `${option.label}ᴹ`
					})),
					// Incompatible groups with "ᶢ" added to the label
					...incompatibleGroups.map(option => ({
						...option,
						label: `${option.label}ᴳ`
					}))
				].sort((a, b) => a.label.localeCompare(b.label))
			}
		];
	}, [meterGroupedOptions, groupsGroupedOptions, filterOptionsByDevice]);

	//Combine the selected values into one array with a type property to differentiate between meters and groups
	const combinedValue = [
		...allSelectedMeterValues.map(value => ({ ...value, meterOrGroup: MeterOrGroup.meters })),
		...allSelectedGroupValues.map(value => ({ ...value, meterOrGroup: MeterOrGroup.groups }))
	];

	const onChange = (newValues: MultiValue<SelectOption>, meta: ActionMeta<SelectOption>) => {
		const newMeters = newValues.filter(option => option.meterOrGroup === MeterOrGroup.meters).map(option => option.value);
		const newGroups = newValues.filter(option => option.meterOrGroup === MeterOrGroup.groups).map(option => option.value);

		dispatch(updateSelectedMeters(newMeters));
		dispatch(updateSelectedGroups(newGroups));
		// Track last added type
		if (meta.action === 'select-option' && meta.option) {
			dispatch(setLastAddedMeterOrGroup(meta.option.meterOrGroup));
		}
		const lastAdded = newValues[newValues.length - 1];
		if (lastAdded && selectedUnit === -99 && lastAdded.defaultGraphicUnit) {
			dispatch(updateSelectedUnit(lastAdded.defaultGraphicUnit));
		}

	};

	const onDeviceChange = (newValue: MultiValue<DeviceOption>) => {
		setSelectedDevices(newValue ? newValue.map(v => v.value) : []);
	};

	return (
		<>
			<>
				<div className="control-label" style={{ marginRight: '8px', whiteSpace: 'nowrap' }}>
					{translate('data.sources')}:
					<TooltipMarkerComponent page='home' helpTextId={'help.home.select.datasources'} />
				</div>
				<div style={{ flexGrow: 1, minWidth: '250px' }}>
					{/* Device Selection Dropdown */}
					<Select<DeviceOption, true>
						isMulti
						placeholder="Select Device(s)..."
						options={deviceOptions}
						value={deviceOptions.filter(opt => selectedDevices.includes(opt.value))}
						onChange={onDeviceChange}
						closeMenuOnSelect={false}
						styles={deviceSelectStyles}
						classNamePrefix="react-select"
						menuPortalTarget={document.body}
						menuPosition="fixed"
						isClearable
						noOptionsMessage={() => 'No devices found'}
					/>
					{/* Telemetry Selection Dropdown */}
					<Select<SelectOption, true, GroupedOption>
						isMulti
						isSearchable={true}
						placeholder={
							selectedDevices.length === 0
								? translate('select.meter.group') + ' (Type to search)'
								: `Search or select telemetry for ${selectedDevices.join(', ')}...`
						}
						options={combinedOptions}
						value={combinedValue}
						onChange={onChange}
						closeMenuOnSelect={false}
						// Customize Labeling for Grouped Labels
						formatGroupLabel={formatGroupLabel}
						// Included React-Select Animations
						components={animatedComponents}
						styles={customStyles}
						isLoading={somethingIsFetching}
						classNamePrefix="react-select"
						menuPortalTarget={document.body}
						menuPosition="fixed"
					/>
				</div>
			</>
		</>
	);
}

const formatGroupLabel = (data: GroupedOption) => {
	return (
		< div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} >
			<span>{data.label}</span>
			<Badge pill color="primary">{data.options.length}</Badge>
		</div >
	);
};


const MultiValueLabel = (props: MultiValueGenericProps<SelectOption, true, GroupedOption>) => {
	// Types for makeAnimated are generic, and does not offer completion, so type assert
	const typedProps = props as MultiValueProps<SelectOption, true, GroupedOption>;
	const ref = React.useRef<HTMLDivElement | null>(null);
	// TODO would be nice if relevant message was derived from uiSelectors, which currently only tracks / trims non-compatible ids
	// TODO Add meta data along chain? i.e. disabled due to chart type, area norm... etc. and display relevant message.
	const isDisabled = typedProps.data.isDisabled;
	const dispatch = useAppDispatch();
	const onThreeD = useAppSelector(state => selectChartToRender(state) === ChartTypes.threeD);
	// TODO Verify behavior, and set proper message/ translate
	return (
		<div ref={ref}
			key={`${typedProps.data.value}:${typedProps.data.label}:${typedProps.data.isDisabled}`}
			data-for={isDisabled ? 'home' : 'select-tooltips'}
			data-tip={isDisabled
				? 'help.home.area.normalize'
				: `${props.data.label}${props.data.meterOrGroup === MeterOrGroup.meters ? 'ᴹ' : props.data.meterOrGroup === MeterOrGroup.groups ? 'ᴳ' : ''}`}
			onMouseDown={e => {
				e.stopPropagation();
				ReactTooltip.rebuild();
				ref.current && ReactTooltip.show(ref.current);
				if (onThreeD && !isDisabled) {
					dispatch(
						updateThreeDMeterOrGroupInfo({
							meterOrGroupID: typedProps.data.value,
							meterOrGroup: typedProps.data.meterOrGroup!
						})
					);
				}
			}}
			onClick={e => e.stopPropagation()}
			style={{ overflow: 'hidden' }}
			onMouseEnter={e => {
				if (!isDisabled) {
					const multiValueLabel = e.currentTarget.children[0];
					// display a react tooltip for options that have overflowing/cutoff labels.
					if (multiValueLabel.scrollWidth > e.currentTarget.clientWidth) {
						ref.current && ReactTooltip.show(ref.current);
					}
				}
			}}
			onMouseLeave={() => {
				ref.current && ReactTooltip.hide(ref.current);
			}}
		>
			<span
				style={{
					display: 'inline-block',
					maxWidth: '120px', // adjust as needed
					whiteSpace: 'nowrap',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					verticalAlign: 'middle'
				}}
			>
				{props.data.label}
				{props.data.meterOrGroup === MeterOrGroup.meters ? 'ᴹ' : props.data.meterOrGroup === MeterOrGroup.groups ? 'ᴳ' : ''}
			</span>
		</div >
	);

};

const animatedComponents = makeAnimated({
	...components,
	MultiValueLabel
});

const deviceSelectStyles: StylesConfig<DeviceOption, true> = {
	control: (base) => ({
		...base,
		fontSize: '12px',
		fontWeight: 500,
		minHeight: '30px',
		height: 'auto',
		maxHeight: '50px',
		marginBottom: '4px',
		borderColor: '#6366f1',
		boxShadow: 'none',
		'&:hover': {
			borderColor: '#818cf8'
		}
	}),
	placeholder: (base) => ({
		...base,
		fontSize: '12px',
		fontWeight: 500,
		color: '#94a3b8'
	}),
	input: (base) => ({
		...base,
		fontSize: '12px',
		fontWeight: 500,
		margin: 0,
		padding: 0
	}),
	option: (base, state) => ({
		...base,
		fontSize: '12px',
		fontWeight: 500,
		backgroundColor: state.isSelected ? '#6366f1' : state.isFocused ? '#eef2ff' : undefined,
		color: state.isSelected ? '#fff' : '#1e293b',
		'&:active': {
			backgroundColor: '#818cf8'
		}
	}),
	multiValue: (base) => ({
		...base,
		backgroundColor: '#eef2ff',
		borderRadius: '4px',
		margin: '1px 2px'
	}),
	multiValueLabel: (base) => ({
		...base,
		fontSize: '11px',
		fontWeight: 600,
		color: '#4f46e5',
		padding: '1px 4px'
	}),
	multiValueRemove: (base) => ({
		...base,
		color: '#6366f1',
		'&:hover': {
			backgroundColor: '#c7d2fe',
			color: '#4338ca'
		}
	}),
	valueContainer: (base) => ({
		...base,
		maxHeight: '44px',
		overflowY: 'auto',
		flexWrap: 'wrap',
		padding: '2px 8px',
		alignContent: 'flex-start'
	}),
	indicatorsContainer: (base) => ({
		...base,
		alignSelf: 'flex-start',
		paddingTop: '2px'
	}),
	menuPortal: (base) => ({
		...base,
		zIndex: 9999
	})
};

const customStyles: StylesConfig<SelectOption, true, GroupedOption> = {
	control: (base) => ({
		...base,
		fontSize: '12px',
		fontWeight: 500,
		minHeight: '34px',
		height: 'auto',
		maxHeight: '60px'
	}),
	placeholder: (base) => ({
		...base,
		fontSize: '12px',
		fontWeight: 500
	}),
	input: (base) => ({
		...base,
		fontSize: '12px',
		fontWeight: 500,
		margin: 0,
		padding: 0
	}),
	singleValue: (base) => ({
		...base,
		fontSize: '12px',
		fontWeight: 500
	}),
	option: (base) => ({
		...base,
		fontSize: '12px',
		fontWeight: 500
	}),
	multiValue: (base, props) => ({
		...base,
		backgroundColor: props.data.isDisabled ? 'hsl(0, 0%, 70%)' : base.backgroundColor,
		margin: '2px',
		maxWidth: '120px'
	}),
	multiValueLabel: (base) => ({
		...base,
		fontSize: '11px',
		fontWeight: 500,
		padding: '2px 4px',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap'
	}),
	valueContainer: (base) => ({
		...base,
		maxHeight: '54px',
		overflowY: 'auto',
		flexWrap: 'wrap',
		padding: '2px 8px',
		alignContent: 'flex-start'
	}),
	indicatorsContainer: (base) => ({
		...base,
		alignSelf: 'flex-start',
		paddingTop: '4px'
	}),
	menuPortal: (base) => ({
		...base,
		zIndex: 9999
	})
};
