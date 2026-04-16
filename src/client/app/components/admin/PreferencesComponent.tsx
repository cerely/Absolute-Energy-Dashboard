/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cloneDeep, isEqual } from 'lodash';
import * as moment from 'moment';
import * as React from 'react';
import { FormattedMessage } from 'react-intl';
import { Button, Input, FormFeedback, FormGroup, Label, Col, Row } from 'reactstrap';
import Select, { MultiValue, StylesConfig } from 'react-select';
import { UnsavedWarningComponent } from '../UnsavedWarningComponent';
import { preferencesApi } from '../../redux/api/preferencesApi';
import {
	MIN_DATE, MIN_DATE_MOMENT, MAX_DATE, MAX_DATE_MOMENT, MAX_ERRORS
} from '../../redux/selectors/adminSelectors';
import { PreferenceRequestItem } from '../../types/items';
import { ChartTypes } from '../../types/redux/graph';
import { LanguageTypes } from '../../types/redux/i18n';
import { AreaUnitType } from '../../utils/getAreaUnitConversion';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';
import { useTranslate } from '../../redux/componentHooks';
import TimeZoneSelect from '../TimeZoneSelect';
import { defaultAdminState } from '../../redux/slices/adminSlice';
import { useAppSelector } from '../../redux/reduxHooks';
import { selectAllMeters } from '../../redux/api/metersApi';
import { useDashboardSettings } from '../../hooks/useDashboardSettings';

/**
 * @returns Preferences Component for Administrative use
 */
export default function PreferencesComponent() {
	const translate = useTranslate();
	const { data: adminPreferences = defaultAdminState } = preferencesApi.useGetPreferencesQuery();
	const [localAdminPref, setLocalAdminPref] = React.useState<PreferenceRequestItem>(cloneDeep(adminPreferences));
	const [submitPreferences] = preferencesApi.useSubmitPreferencesMutation();
	const [hasChanges, setHasChanges] = React.useState<boolean>(false);

	// mutation will invalidate preferences tag and will be re-fetched.
	// On query response, reset local changes to response
	React.useEffect(() => { setLocalAdminPref(cloneDeep(adminPreferences)); }, [adminPreferences]);
	// Compare the API response against the localState to determine changes
	React.useEffect(() => { setHasChanges(!isEqual(adminPreferences, localAdminPref)); }, [localAdminPref, adminPreferences]);

	const makeLocalChanges = (key: keyof PreferenceRequestItem, value: PreferenceRequestItem[keyof PreferenceRequestItem]) => {
		setLocalAdminPref({ ...localAdminPref, [key]: value });
	};

	const discardChanges = () => {
		setLocalAdminPref(cloneDeep(adminPreferences));
	};

	// Functions for input validation and warnings. Each returns true if the user inputs invalid data into its field
	// Need to be functions due to static reference. If they were booleans they wouldn't update when localAdminPref updates
	const invalidFuncs = {
		readingFreq: (): boolean => {
			const frequency = moment.duration(localAdminPref.defaultMeterReadingFrequency);
			return !frequency.isValid() || frequency.asSeconds() <= 0;
		},
		minDate: (): boolean => {
			const minMoment = moment(localAdminPref.defaultMeterMinimumDate);
			const maxMoment = moment(localAdminPref.defaultMeterMaximumDate);
			return !minMoment.isValid() || !minMoment.isSameOrAfter(MIN_DATE_MOMENT) || !minMoment.isSameOrBefore(maxMoment);
		},
		maxDate: (): boolean => {
			const minMoment = moment(localAdminPref.defaultMeterMinimumDate);
			const maxMoment = moment(localAdminPref.defaultMeterMaximumDate);
			return !maxMoment.isValid() || !maxMoment.isSameOrBefore(MAX_DATE_MOMENT) || !maxMoment.isSameOrAfter(minMoment);
		},
		readingGap: (): boolean => { return Number(localAdminPref.defaultMeterReadingGap) < 0; },

		meterErrors: (): boolean => {
			return Number(localAdminPref.defaultMeterMaximumErrors) < 0
				|| Number(localAdminPref.defaultMeterMaximumErrors) > MAX_ERRORS;
		},

		warningFileSize: (): boolean => {
			return Number(localAdminPref.defaultWarningFileSize) < 0
				|| Number(localAdminPref.defaultWarningFileSize) > Number(localAdminPref.defaultFileSizeLimit);
		},

		fileSizeLimit: (): boolean => {
			return Number(localAdminPref.defaultFileSizeLimit) < 0
				|| Number(localAdminPref.defaultWarningFileSize) > Number(localAdminPref.defaultFileSizeLimit);
		}
	};

	return (
		<div className='d-flex flex-column' style={{ fontFamily: 'Inter, sans-serif' }}>


			<UnsavedWarningComponent
				hasUnsavedChanges={hasChanges}
				changes={localAdminPref}
				submitChanges={submitPreferences}
				successMessage='updated.preferences'
				failureMessage='failed.to.submit.changes'
			/>

			{/* Main Card */}
			<div style={cardStyle} className="admin-preference-card">
				{/* Graph Settings */}
				<section style={{ marginBottom: '40px' }}>
					<h4 style={sectionHeaderStyle} className="admin-section-header">{translate('graph.settings')}</h4>

					<Row style={rowStyle}>
						<Col sm={12}>
							<Label style={labelStyle}>
								<FormattedMessage id='default.graph.type' />
							</Label>
							<div className="d-flex align-items-center flex-wrap">
								{Object.values(ChartTypes)
									.filter(chartType => ![ChartTypes.compare, ChartTypes.threeD, ChartTypes.compareLine, ChartTypes.map].includes(chartType))
									.map(chartType => (
										<div key={chartType} style={{ marginRight: '20px' }} className="d-flex align-items-center">
											<Input
												type='radio'
												name='chartTypes'
												id={`chartType-${chartType}`}
												value={chartType}
												onChange={e => makeLocalChanges('defaultChartToRender', e.target.value)}
												checked={localAdminPref.defaultChartToRender === chartType}
												style={{ marginRight: '8px', cursor: 'pointer' }}
											/>
											<Label htmlFor={`chartType-${chartType}`} style={{ margin: 0, cursor: 'pointer', fontWeight: 'normal' }}>
												{translate(chartType)}
											</Label>
										</div>
									))}
							</div>
						</Col>
					</Row>

					<Row style={rowStyle}>
						<Col sm={12}>
							<Label style={labelStyle}>
								<FormattedMessage id='default.graph.settings' />
							</Label>
							<div className="d-flex align-items-center flex-wrap">
								<div style={{ marginRight: '20px' }} className="d-flex align-items-center">
									<Input
										type='checkbox'
										id="barStacking"
										onChange={e => makeLocalChanges('defaultBarStacking', e.target.checked)}
										checked={localAdminPref.defaultBarStacking}
										style={{ marginRight: '8px', cursor: 'pointer' }}
									/>
									<Label htmlFor="barStacking" style={{ margin: 0, cursor: 'pointer', fontWeight: 'normal' }}>
										{translate('default.bar.stacking')}
									</Label>
								</div>
								<div className="d-flex align-items-center">
									<Input
										type='checkbox'
										id="areaNormalization"
										onChange={e => makeLocalChanges('defaultAreaNormalization', e.target.checked)}
										checked={localAdminPref.defaultAreaNormalization}
										style={{ marginRight: '8px', cursor: 'pointer' }}
									/>
									<Label htmlFor="areaNormalization" style={{ margin: 0, cursor: 'pointer', fontWeight: 'normal' }}>
										{translate('default.area.normalize')}
									</Label>
								</div>
							</div>
						</Col>
					</Row>

					<Row style={rowStyle}>
						<Col sm={12}>
							<Label style={labelStyle}>
								{translate('default.area.unit')}
							</Label>
							<div className="d-flex align-items-center flex-wrap">
								<div style={{ marginRight: '20px' }} className="d-flex align-items-center">
									<Input
										type='radio'
										name='areaUnitType'
										value={AreaUnitType.feet}
										id="unitFeet"
										onChange={e => makeLocalChanges('defaultAreaUnit', e.target.value)}
										checked={localAdminPref.defaultAreaUnit === AreaUnitType.feet}
										style={{ marginRight: '8px', cursor: 'pointer' }}
									/>
									<Label htmlFor="unitFeet" style={{ margin: 0, cursor: 'pointer', fontWeight: 'normal' }}>
										{translate('AreaUnitType.feet')}
									</Label>
								</div>
								<div className="d-flex align-items-center">
									<Input
										type='radio'
										name='areaUnitType'
										value={AreaUnitType.meters}
										id="unitMeters"
										onChange={e => makeLocalChanges('defaultAreaUnit', e.target.value)}
										checked={localAdminPref.defaultAreaUnit === AreaUnitType.meters}
										style={{ marginRight: '8px', cursor: 'pointer' }}
									/>
									<Label htmlFor="unitMeters" style={{ margin: 0, cursor: 'pointer', fontWeight: 'normal' }}>
										{translate('AreaUnitType.meters')}
									</Label>
								</div>
							</div>
						</Col>
					</Row>
				</section>

				{/* Meter Settings */}
				<section style={{ marginBottom: '40px' }}>
					<h4 style={sectionHeaderStyle} className="admin-section-header">{translate('meter.settings')}</h4>

					<FormGroup style={formGroupStyle}>
						<Label style={labelStyleNew}>
							{translate('default.meter.reading.frequency')}
						</Label>
						<Input
							type='text'
							value={localAdminPref.defaultMeterReadingFrequency}
							onChange={e => makeLocalChanges('defaultMeterReadingFrequency', e.target.value)}
							invalid={invalidFuncs.readingFreq()}
							style={inputStyle}
							placeholder="PT15M"
						/>
						<FormFeedback>
							<FormattedMessage id="invalid.input" ></FormattedMessage>
						</FormFeedback>
					</FormGroup>

					<FormGroup style={formGroupStyle}>
						<Label style={labelStyleNew}>
							{translate('default.meter.minimum.date')}
						</Label>
						<Input
							type='text'
							value={localAdminPref.defaultMeterMinimumDate}
							onChange={e => makeLocalChanges('defaultMeterMinimumDate', e.target.value)}
							placeholder='YYYY-MM-DD HH:MM:SS'
							invalid={invalidFuncs.minDate()}
							style={inputStyle}
						/>
						<FormFeedback>
							<FormattedMessage id="error.bounds" values={{ min: MIN_DATE, max: moment(localAdminPref.defaultMeterMaximumDate).utc().format() }} />
						</FormFeedback>
					</FormGroup>

					<FormGroup style={formGroupStyle}>
						<Label style={labelStyleNew}>
							{translate('default.meter.maximum.date')}
						</Label>
						<Input
							type='text'
							value={localAdminPref.defaultMeterMaximumDate}
							onChange={e => makeLocalChanges('defaultMeterMaximumDate', e.target.value)}
							placeholder='YYYY-MM-DD HH:MM:SS'
							invalid={invalidFuncs.maxDate()}
							style={inputStyle}
						/>
						<FormFeedback>
							<FormattedMessage id="error.bounds" values={{ min: moment(localAdminPref.defaultMeterMinimumDate).utc().format(), max: MAX_DATE }} />
						</FormFeedback>
					</FormGroup>

					<FormGroup style={formGroupStyle}>
						<Label style={labelStyleNew}>
							{translate('default.meter.reading.gap')}
						</Label>
						<Input
							type='number'
							value={localAdminPref.defaultMeterReadingGap}
							onChange={e => makeLocalChanges('defaultMeterReadingGap', e.target.value)}
							min='0'
							maxLength={50}
							invalid={invalidFuncs.readingGap()}
							style={inputStyle}
							placeholder="PT15M"
						/>
						<FormFeedback>
							<FormattedMessage id="error.bounds" values={{ min: 0, max: Infinity }} />
						</FormFeedback>
					</FormGroup>

					<FormGroup style={formGroupStyle}>
						<Label style={labelStyleNew}>
							{translate('default.meter.maximum.errors')}
						</Label>
						<Input
							type='number'
							value={localAdminPref.defaultMeterMaximumErrors}
							onChange={e => makeLocalChanges('defaultMeterMaximumErrors', e.target.value)}
							min='0'
							max={MAX_ERRORS}
							maxLength={50}
							invalid={invalidFuncs.meterErrors()}
							style={inputStyle}
						/>
						<FormFeedback>
							<FormattedMessage id="error.bounds" values={{ min: 0, max: MAX_ERRORS }} />
						</FormFeedback>
					</FormGroup>
				</section>

				{/* Site Settings */}
				<section>
					<h4 style={sectionHeaderStyle} className="admin-section-header">{translate('site.settings')}</h4>

					<FormGroup style={formGroupStyle}>
						<Label style={labelStyleNew}>
							{translate('site.title')}
						</Label>
						<Input
							type='text'
							placeholder={translate('name')}
							value={localAdminPref.displayTitle}
							onChange={e => makeLocalChanges('displayTitle', e.target.value)}
							maxLength={50}
							style={inputStyle}
						/>
					</FormGroup>

					<FormGroup style={formGroupStyle}>
						<Label style={labelStyleNew}>
							{translate('default.language')}
						</Label>
						<div className="d-flex align-items-center flex-wrap">
							<div className="d-flex align-items-center" style={{ marginRight: '20px' }}>
								<Input
									type='radio'
									name='languageTypes'
									id="langEnglish"
									value={LanguageTypes.en}
									onChange={e => makeLocalChanges('defaultLanguage', e.target.value)}
									checked={localAdminPref.defaultLanguage === LanguageTypes.en}
									style={{ marginRight: '8px', cursor: 'pointer' }}
								/>
								<Label htmlFor="langEnglish" style={{ margin: 0, cursor: 'pointer', fontWeight: 'normal' }}>
									English
								</Label>
							</div>
							<div className="d-flex align-items-center" style={{ marginRight: '20px' }}>
								<Input
									type='radio'
									name='languageTypes'
									id="langFrench"
									value={LanguageTypes.fr}
									onChange={e => makeLocalChanges('defaultLanguage', e.target.value)}
									checked={localAdminPref.defaultLanguage === LanguageTypes.fr}
									style={{ marginRight: '8px', cursor: 'pointer' }}
								/>
								<Label htmlFor="langFrench" style={{ margin: 0, cursor: 'pointer', fontWeight: 'normal' }}>
									Français
								</Label>
							</div>
							<div className="d-flex align-items-center">
								<Input
									type='radio'
									name='languageTypes'
									id="langSpan"
									value={LanguageTypes.es}
									onChange={e => makeLocalChanges('defaultLanguage', e.target.value)}
									checked={localAdminPref.defaultLanguage === LanguageTypes.es}
									style={{ marginRight: '8px', cursor: 'pointer' }}
								/>
								<Label htmlFor="langSpan" style={{ margin: 0, cursor: 'pointer', fontWeight: 'normal' }}>
									Español
								</Label>
							</div>
						</div>
					</FormGroup>

					<FormGroup style={formGroupStyle}>
						<Label style={labelStyleNew}>
							{translate('default.time.zone')}
						</Label>
						<div style={{ maxWidth: '400px' }}>
							<TimeZoneSelect
								current={localAdminPref.defaultTimezone}
								handleClick={e => makeLocalChanges('defaultTimezone', e)}
							/>
						</div>
					</FormGroup>

					<FormGroup style={formGroupStyle}>
						<Label style={labelStyleNew}>
							{translate('default.warning.file.size')}
						</Label>
						<Input
							type='number'
							value={localAdminPref.defaultWarningFileSize}
							onChange={e => makeLocalChanges('defaultWarningFileSize', e.target.value)}
							min='0'
							max={Number(localAdminPref.defaultFileSizeLimit)}
							maxLength={50}
							invalid={invalidFuncs.warningFileSize()}
							style={inputStyle}
						/>
						<FormFeedback>
							<FormattedMessage id="error.bounds" values={{ min: 0, max: Number(localAdminPref.defaultFileSizeLimit) }} />
						</FormFeedback>
					</FormGroup>

					<FormGroup style={formGroupStyle}>
						<Label style={labelStyleNew}>
							{translate('default.file.size.limit')}
						</Label>
						<Input
							type='number'
							value={localAdminPref.defaultFileSizeLimit}
							onChange={e => makeLocalChanges('defaultFileSizeLimit', e.target.value)}
							min={Number(localAdminPref.defaultWarningFileSize)}
							maxLength={50}
							invalid={invalidFuncs.fileSizeLimit()}
							style={inputStyle}
						/>
						<FormFeedback>
							<FormattedMessage id="error.bounds" values={{ min: Number(localAdminPref.defaultWarningFileSize), max: Infinity }} />
						</FormFeedback>
					</FormGroup>

					<FormGroup style={formGroupStyle}>
						<Label style={labelStyleNew}>
							<FormattedMessage id='default.help.url' />
						</Label>
						<Input
							type='text'
							value={localAdminPref.defaultHelpUrl}
							onChange={e => makeLocalChanges('defaultHelpUrl', e.target.value)}
							style={inputStyle}
						/>
					</FormGroup>
				</section>

				{/* Dashboard Settings */}
				<DashboardSettingsSection />
			</div>

			<div className='d-flex justify-content-end mt-4 mb-5'>
				<Button
					type='button'
					onClick={discardChanges}
					disabled={!hasChanges}
					style={{ marginRight: '20px' }}
					color='secondary'
				>
					{translate('discard.changes')}
				</Button>
				<Button
					type='submit'
					onClick={() =>
						submitPreferences(localAdminPref)
							.unwrap()
							.then(() => {
								showSuccessNotification(translate('updated.preferences'));
							})
							.catch(() => {
								showErrorNotification(translate('failed.to.submit.changes'));
							})
					}
					disabled={!hasChanges || Object.values(invalidFuncs).some(check => check())}
					color='primary'
				>
					{translate('submit')}
				</Button>
			</div>
		</div >
	);
}

const cardStyle: React.CSSProperties = {
	border: '1px solid var(--card-border, #dee2e6)',
	borderRadius: '8px',
	padding: '30px',
	boxShadow: 'var(--card-shadow, 0 2px 4px rgba(0,0,0,0.02))'
};

const sectionHeaderStyle: React.CSSProperties = {
	fontSize: '20px',
	fontWeight: '500',
	marginBottom: '20px',
	borderBottom: '1px solid var(--divider-color, #eee)',
	paddingBottom: '10px'
};

const labelStyle: React.CSSProperties = {
	fontSize: '14px',
	color: 'var(--text-label, #7f8c8d)',
	fontWeight: 'normal',
	marginBottom: '10px',
	display: 'block'
};

const labelStyleNew: React.CSSProperties = {
	fontSize: '14px',
	color: 'var(--text-value, #333)',
	fontWeight: '400',
	marginBottom: '6px'
};

const inputStyle: React.CSSProperties = {
	maxWidth: '400px',
	borderRadius: '6px',
	border: '1px solid #ced4da',
	padding: '8px 12px'
};

const rowStyle: React.CSSProperties = {
	marginBottom: '20px'
};

const formGroupStyle: React.CSSProperties = {
	marginBottom: '25px'
};

// ────────────────────────────────────────────────
// Dashboard Settings Sub-Component
// ────────────────────────────────────────────────

interface MeterOption {
	label: string;
	value: number;
}

const dashboardSelectStyles: StylesConfig<any, any> = {
	control: (base) => ({
		...base,
		maxWidth: '600px',
		borderRadius: '6px',
		border: '1px solid var(--card-border, #ced4da)',
		minHeight: '38px',
		fontSize: '14px',
		backgroundColor: 'var(--card-bg, #fff)'
	}),
	option: (base, state) => ({
		...base,
		fontSize: '13px',
		backgroundColor: state.isSelected ? 'var(--accent-color, #6366f1)' : state.isFocused ? 'rgba(59, 91, 254, 0.1)' : 'var(--card-bg, #fff)',
		color: state.isSelected ? '#ffffff' : 'var(--text-value, #1e293b)'
	}),
	singleValue: (base) => ({
		...base,
		color: 'var(--text-value, #333)'
	}),
	multiValue: (base) => ({
		...base,
		backgroundColor: 'var(--card-border, #e2e8f0)',
		borderRadius: '4px'
	}),
	multiValueLabel: (base) => ({
		...base,
		color: 'var(--text-value, #333)',
		fontWeight: 500,
		fontSize: '12px'
	}),
	multiValueRemove: (base) => ({
		...base,
		color: 'var(--text-value, #333)',
		'&:hover': {
			backgroundColor: 'var(--accent-color, #c7d2fe)',
			color: '#ffffff'
		}
	}),
	menu: (base) => ({
		...base,
		backgroundColor: 'var(--card-bg, #fff)',
		border: '1px solid var(--card-border, #E5E7EB)'
	}),
	menuPortal: (base) => ({
		...base,
		zIndex: 9999
	})
};

function DashboardSettingsSection() {
	const allMeters = useAppSelector(selectAllMeters);
	const { settings, updateSettings } = useDashboardSettings();
	const [saved, setSaved] = React.useState(false);
	const [selectedDevices, setSelectedDevices] = React.useState<string[]>([]);

	// Logo upload state
	const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
	const [logoSaving, setLogoSaving] = React.useState(false);
	const fileInputRef = React.useRef<HTMLInputElement>(null);

	// Fetch current logo on mount
	React.useEffect(() => {
		fetch('/api/dashboard/get-logo')
			.then(r => r.json())
			.then(data => {
				if (data.logoUrl) setLogoPreview(data.logoUrl);
			})
			.catch(() => { /* ignore */ });
	}, []);

	const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		if (file.size > 2 * 1024 * 1024) {
			showErrorNotification('Logo file must be under 2 MB.');
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			setLogoPreview(dataUrl);
		};
		reader.readAsDataURL(file);
	};

	const handleLogoSave = async () => {
		setLogoSaving(true);
		try {
			const res = await fetch('/api/dashboard/set-logo', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ logoUrl: logoPreview })
			});
			if (res.ok) {
				showSuccessNotification('Logo saved successfully. Reload the page to see the change in the sidebar.');
			} else {
				showErrorNotification('Failed to save logo.');
			}
		} catch {
			showErrorNotification('Error saving logo.');
		}
		setLogoSaving(false);
	};

	const handleLogoRemove = async () => {
		setLogoSaving(true);
		try {
			await fetch('/api/dashboard/set-logo', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ logoUrl: null })
			});
			setLogoPreview(null);
			if (fileInputRef.current) fileInputRef.current.value = '';
			showSuccessNotification('Logo removed. Reload the page to see the change.');
		} catch {
			showErrorNotification('Error removing logo.');
		}
		setLogoSaving(false);
	};

	// Extract device name from meter identifier (e.g., "EM1/kWh_Import" → "EM1")
	const getDevice = (identifier: string): string => {
		if (!identifier) return 'Other';
		const idx = identifier.indexOf('/');
		return idx > 0 ? identifier.substring(0, idx) : 'Other';
	};

	// Build meter options from all meters
	const meterOptions = React.useMemo<MeterOption[]>(() => {
		if (!allMeters) return [];
		return allMeters
			.filter(m => m.enabled)
			.map(m => ({
				label: m.identifier || m.name || `Meter #${m.id}`,
				value: m.id
			}))
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [allMeters]);

	// Build device options
	interface DeviceOpt { label: string; value: string }
	const deviceOptions = React.useMemo<DeviceOpt[]>(() => {
		if (!allMeters) return [];
		const deviceSet = new Set<string>();
		allMeters.filter(m => m.enabled).forEach(m => {
			deviceSet.add(getDevice(m.identifier));
		});
		return Array.from(deviceSet)
			.sort((a, b) => a.localeCompare(b))
			.map(d => ({ label: d, value: d }));
	}, [allMeters]);

	// Current  selected values for dropdowns
	const meterStatusValues = React.useMemo(() =>
		meterOptions.filter(o => settings.meterStatusMeterIds.includes(o.value)),
		[meterOptions, settings.meterStatusMeterIds]
	);
	
	const deviceValues = React.useMemo(() =>
		deviceOptions.filter(o => selectedDevices.includes(o.value)),
		[deviceOptions, selectedDevices]
	);

	const reportMeterValue = React.useMemo(() =>
		meterOptions.find(o => o.value === settings.reportMeterId) || null,
		[meterOptions, settings.reportMeterId]
	);

	const onMeterStatusChange = (newValue: MultiValue<MeterOption>) => {
		updateSettings({ meterStatusMeterIds: newValue.map(v => v.value) });
		setSaved(false);
	};

	// When a device is selected, add all meters from that device
	const onDeviceChange = (newValue: MultiValue<DeviceOpt>) => {
		const newDevices = newValue ? newValue.map(v => v.value) : [];
		setSelectedDevices(newDevices);

		if (newDevices.length > 0 && allMeters) {
			// Get all meter IDs for the selected devices
			const deviceMeterIds = allMeters
				.filter(m => m.enabled && newDevices.includes(getDevice(m.identifier)))
				.map(m => m.id);
			// Merge with any existing individually selected meters
			const existingIds = new Set(settings.meterStatusMeterIds);
			deviceMeterIds.forEach(id => existingIds.add(id));
			updateSettings({ meterStatusMeterIds: Array.from(existingIds) });
		}
		setSaved(false);
	};

	const handleSaveDashboard = () => {
		setSaved(true);
		showSuccessNotification('Dashboard settings saved successfully.');
		setTimeout(() => setSaved(false), 2000);
	};

	return (
		<section style={{ marginBottom: '40px' }}>
			<h4 style={sectionHeaderStyle} className="admin-section-header">Dashboard Settings</h4>

			{/* Site Logo Upload */}
			<FormGroup style={formGroupStyle}>
				<Label style={labelStyleNew}>Site Logo (Sidebar)</Label>
				<p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '8px', marginTop: 0 }}>
					Upload a logo to display at the top of the sidebar. Accepts PNG, JPG, or SVG (max 2 MB).
				</p>
				<div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
					{logoPreview && (
						<div style={{
							width: '120px', height: '60px', borderRadius: '8px',
							backgroundColor: 'rgba(255,255,255,0.95)', padding: '6px 10px',
							display: 'flex', alignItems: 'center', justifyContent: 'center',
							border: '1px solid var(--card-border, #E5E7EB)'
						}}>
							<img src={logoPreview} alt="Logo preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
						</div>
					)}
					<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/png,image/jpeg,image/svg+xml"
							onChange={handleLogoUpload}
							style={{
								fontSize: '13px',
								color: 'var(--text-value, #333)',
								padding: '6px',
								border: '1px solid var(--card-border, #E5E7EB)',
								borderRadius: '6px',
								backgroundColor: 'var(--card-bg, #fff)',
								cursor: 'pointer'
							}}
						/>
						<div style={{ display: 'flex', gap: '8px' }}>
							<Button
								color="primary"
								size="sm"
								disabled={!logoPreview || logoSaving}
								onClick={handleLogoSave}
							>
								{logoSaving ? 'Saving...' : 'Save Logo'}
							</Button>
							{logoPreview && (
								<Button
									color="danger"
									outline
									size="sm"
									disabled={logoSaving}
									onClick={handleLogoRemove}
								>
									Remove
								</Button>
							)}
						</div>
					</div>
				</div>
			</FormGroup>


			<FormGroup style={formGroupStyle}>
				<Label style={labelStyleNew}>Dashboard Page Default Setting - Graph Days</Label>
				<p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '8px', marginTop: 0 }}>
					Set the default date range (in days) to display on the Energy Consumption graph.
				</p>
				<Input
					type='number'
					min={1}
					max={365}
					value={settings.dashboardGraphDays || 1}
					onChange={e => { updateSettings({ dashboardGraphDays: parseInt(e.target.value) || 1 }); setSaved(false); }}
					style={inputStyle}
				/>
			</FormGroup>

			<FormGroup style={formGroupStyle}>
				<Label style={labelStyleNew}>Dashboard Page — Monthly Energy Budget (Limit)</Label>
				<p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '8px', marginTop: 0 }}>
					Set the monthly energy budget limit. The gauge shows total monetary cost ((reading - start of month) × rate) as a percentage of this limit.
					Set to <strong>0</strong> to disable.
				</p>
				<Input
					type='number'
					min={0}
					step={100}
					value={settings.energyBudgetKwh ?? 0}
					onChange={e => { updateSettings({ energyBudgetKwh: parseFloat(e.target.value) || 0 }); setSaved(false); }}
					style={inputStyle}
					placeholder="e.g. 15000"
				/>
			</FormGroup>

			<FormGroup style={formGroupStyle}>
				<Label style={labelStyleNew}>
					Default Meter Status — Select by Device
				</Label>
				<p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '8px', marginTop: 0 }}>
					Select a device to automatically add all its telemetry meters to the Meter Status widget.
				</p>
				<Select<DeviceOpt, true>
					isMulti
					placeholder="Select device(s) to add all their meters..."
					options={deviceOptions}
					value={deviceValues}
					onChange={onDeviceChange}
					closeMenuOnSelect={false}
					styles={dashboardSelectStyles as unknown as StylesConfig<DeviceOpt, true>}
					menuPortalTarget={document.body}
					menuPosition="fixed"
					isClearable
					noOptionsMessage={() => 'No devices found'}
				/>
			</FormGroup>

			<FormGroup style={formGroupStyle}>
				<Label style={labelStyleNew}>
					Default Meter Status — Individual Meters
				</Label>
				<p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '8px', marginTop: 0 }}>
					Select individual meters for the Meter Status widget, or use the device selector above.
					If none are selected, all enabled meters will be shown.
				</p>
				<Select<MeterOption, true>
					isMulti
					placeholder="Select meters for the status widget..."
					options={meterOptions}
					value={meterStatusValues}
					onChange={onMeterStatusChange}
					closeMenuOnSelect={false}
					styles={dashboardSelectStyles}
					menuPortalTarget={document.body}
					menuPosition="fixed"
					isClearable
					noOptionsMessage={() => 'No meters found'}
				/>
			</FormGroup>

			<FormGroup style={formGroupStyle}>
				<Label style={labelStyleNew}>Report Settings — Default Address</Label>
				<Input
					type='textarea'
					placeholder="Default bill address..."
					value={settings.defaultAddress}
					onChange={e => { updateSettings({ defaultAddress: e.target.value }); setSaved(false); }}
					style={inputStyle}
				/>
			</FormGroup>

			<FormGroup style={formGroupStyle}>
				<Label style={labelStyleNew}>Report Settings — Default Activity</Label>
				<Input
					type='text'
					placeholder="e.g. STONE CRUSHING UNITS"
					value={settings.defaultActivity}
					onChange={e => { updateSettings({ defaultActivity: e.target.value }); setSaved(false); }}
					style={inputStyle}
				/>
			</FormGroup>

			<FormGroup style={formGroupStyle}>
				<Label style={labelStyleNew}>Report Settings — Default Meter</Label>
				<Select<MeterOption, false>
					placeholder="Select default meter..."
					options={meterOptions}
					value={reportMeterValue}
					onChange={v => { updateSettings({ reportMeterId: v ? v.value : null }); setSaved(false); }}
					styles={dashboardSelectStyles as any}
					menuPortalTarget={document.body}
					menuPosition="fixed"
					isClearable
				/>
			</FormGroup>

			<FormGroup style={formGroupStyle}>
				<Label style={labelStyleNew}>Report Settings — Monthly Bill Recipient Email</Label>
				<p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '8px', marginTop: 0 }}>
					The address where the automated monthly electricity bill summary will be sent on the 1st of every month.
				</p>
				<Input
					type='email'
					placeholder="e.g. admin@example.com"
					value={settings.reportRecipientEmail || ''}
					onChange={e => { updateSettings({ reportRecipientEmail: e.target.value }); setSaved(false); }}
					style={inputStyle}
				/>
			</FormGroup>

			<hr style={{ margin: '32px 0', borderColor: 'var(--divider-color, #e5e7eb)' }} />

			<h5 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-value, #111827)' }}>
				Time-of-Day (TOD) Energy Rates
			</h5>
			<p style={{ fontSize: '12px', color: 'var(--text-label, #6B7280)', marginBottom: '16px' }}>
				Set the rate offset (+/- ₹/kWh) for each TOD slot relative to the Industrial Base Rate. Use negative values (e.g., -1.94) for off-peak discounts.
			</p>

			{/* Industrial (Base) Rate — master rate used for billing and as default for peak slots */}
			<div style={{
				display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
				marginBottom: '20px', padding: '14px 16px',
				border: '2px solid var(--accent-color, #6366f1)',
				borderRadius: '10px',
				background: 'rgba(99, 102, 241, 0.06)'
			}}>
				<div style={{ flex: 1, minWidth: '200px' }}>
					<Label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-value, #111827)', marginBottom: '2px', display: 'block' }}>
						⚡ Industrial (Base) Energy Rate
					</Label>
					<p style={{ fontSize: '11px', color: 'var(--text-label, #6B7280)', margin: 0 }}>
						Flat tariff rate (LT-V B II or similar). Applied directly in regular billing reports and used as the zero-offset baseline for TOD slot calculations.
					</p>
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
					<span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-label, #6B7280)' }}>₹</span>
					<Input
						type="number"
						step="0.01"
						min="0"
						value={(settings.rateHistory && settings.rateHistory.length > 0) ? settings.rateHistory[0].energyRate : 7.76}
						onChange={e => {
							const val = parseFloat(e.target.value) || 0;
							const newHistory = [...(settings.rateHistory || [])];
							if (newHistory.length > 0) {
								newHistory[0] = { ...newHistory[0], energyRate: val };
							} else {
								newHistory.push({ effectiveDate: new Date().toISOString().split('T')[0], energyRate: val, demandChargeRate: 400, wheelingRate: 1.39, facRate: 0.30, electricityDuty: 7.5, taxOnSale: 0.29, contractDemand: 100, tariffCategory: 'Industrial (LT-V B II)', billedDemand: 8 });
							}
							updateSettings({ rateHistory: newHistory });
							setSaved(false);
						}}
						style={{ width: '110px', fontWeight: 600, fontSize: '15px', borderColor: '#6366f1' }}
					/>
					<span style={{ fontSize: '13px', color: 'var(--text-label, #6B7280)' }}>/kWh</span>
				</div>
			</div>

			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
				{([
					{ key: 'slot_2206', label: '22:00 – 06:00', desc: 'Off-peak / Night' },
					{ key: 'slot_0609', label: '06:00 – 09:00', desc: 'Morning Shoulder' },
					{ key: 'slot_0912', label: '09:00 – 12:00', desc: 'Morning Peak' },
					{ key: 'slot_1218', label: '12:00 – 18:00', desc: 'Afternoon Peak' },
					{ key: 'slot_1822', label: '18:00 – 22:00', desc: 'Evening Peak' },
				] as { key: keyof import('../../hooks/useDashboardSettings').TodRates; label: string; desc: string }[]).map(slot => (
					<div key={slot.key} style={{ padding: '12px', border: '1px solid var(--card-border, #E5E7EB)', borderRadius: '8px', background: 'var(--card-bg, #F9FAFB)' }}>
						<Label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-value, #111827)', marginBottom: '2px', display: 'block' }}>
							{slot.label}
						</Label>
						<p style={{ fontSize: '11px', color: 'var(--text-label, #6B7280)', margin: '0 0 8px' }}>{slot.desc}</p>
						<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
							<span style={{ fontSize: '13px', color: 'var(--text-label, #6B7280)' }}>₹</span>
							<Input
								type="number"
								step="0.01"
								bsSize="sm"
								value={(settings.todRates ?? {})[slot.key] ?? 0.00}
								onChange={e => {
									const newTod = { ...(settings.todRates ?? {}), [slot.key]: parseFloat(e.target.value) || 0 };
									updateSettings({ todRates: newTod as import('../../hooks/useDashboardSettings').TodRates });
									setSaved(false);
								}}
								style={{ maxWidth: '85px' }}
							/>
							<span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-label, #6B7280)' }}>/kWh</span>
						</div>
					</div>
				))}
			</div>

			<hr style={{ margin: '32px 0', borderColor: 'var(--divider-color, #e5e7eb)' }} />

			<h5 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: 'var(--text-value, #111827)' }}>Dashboard Display Config</h5>
			<p style={{ fontSize: '12px', color: 'var(--text-label, #6B7280)', marginBottom: '16px' }}>
				Configure the meters/devices that will be available in the dashboard filters card. If none are added, it will fallback to auto-detecting devices.
			</p>

			<div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
				{(settings.customDashboardDevices || []).map((device, index) => {
					// Filter meter options to only show telemetries for the selected device
					const deviceMeterOptions = device.name && device.name !== 'New Device'
						? meterOptions.filter(o => {
							const meterDevice = getDevice(o.label);
							return meterDevice === device.name;
						})
						: meterOptions;

					return (
					<div key={device.id || index} style={{ padding: '16px', border: '1px solid var(--card-border, #E5E7EB)', borderRadius: '8px', background: 'var(--card-bg, #F9FAFB)' }}>
						<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
							<strong style={{ color: 'var(--text-value, #333)' }}>Device: {device.name || 'Unnamed'}</strong>
							<Button size="sm" color="danger" outline onClick={() => {
								const newDevices = [...(settings.customDashboardDevices || [])];
								newDevices.splice(index, 1);
								updateSettings({ customDashboardDevices: newDevices });
								setSaved(false);
							}}>Remove</Button>
						</div>
						<div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
							<div>
								<Label style={{ fontSize: '11px', color: 'var(--text-label, #6B7280)', marginBottom: '4px' }}>Select Device (from topic)</Label>
								<Select<DeviceOpt, false>
									placeholder="Select a device..."
									options={deviceOptions}
									value={deviceOptions.find(o => o.value === device.name) || null}
									onChange={v => {
										const newDevices = [...(settings.customDashboardDevices || [])];
										const newName = v ? v.value : '';
										// When device changes, clear existing meter selections since they belong to old device
										newDevices[index] = {
											...newDevices[index],
											name: newName,
											totalKwhMeterId: null,
											peakDemandMeterId: null,
											powerFactorMeterId: null,
											energyMeterId: null,
											energyConsumptionMeterIds: []
										};
										updateSettings({ customDashboardDevices: newDevices });
										setSaved(false);
									}}
									styles={dashboardSelectStyles as unknown as StylesConfig<DeviceOpt, false>}
									menuPortalTarget={document.body}
									menuPosition="fixed"
									isClearable
									noOptionsMessage={() => 'No devices found'}
								/>
							</div>
							<div>
								<Label style={{ fontSize: '11px', color: 'var(--text-label, #6B7280)', marginBottom: '4px' }}>Display Label (shown on dashboard)</Label>
								<Input type="text" bsSize="sm" placeholder="e.g. Main Panel, Floor 2 Meter" value={device.label || ''} onChange={e => {
									const newDevices = [...(settings.customDashboardDevices || [])];
									newDevices[index] = { ...newDevices[index], label: e.target.value };
									updateSettings({ customDashboardDevices: newDevices });
									setSaved(false);
								}} />
							</div>
							<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
								<div>
									<Label style={{ fontSize: '11px', color: 'var(--text-label, #6B7280)', marginBottom: '4px' }}>Total kWh Usage Meter</Label>
									<Select<MeterOption, false>
										placeholder="Select meter..."
										options={deviceMeterOptions}
										value={meterOptions.find(o => o.value === device.totalKwhMeterId) || null}
										onChange={v => {
											const newDevices = [...(settings.customDashboardDevices || [])];
											newDevices[index] = { ...newDevices[index], totalKwhMeterId: v ? v.value : null };
											updateSettings({ customDashboardDevices: newDevices });
											setSaved(false);
										}}
										styles={dashboardSelectStyles as any}
										menuPortalTarget={document.body}
										menuPosition="fixed"
										isClearable
										noOptionsMessage={() => device.name ? `No meters for ${device.name}` : 'Select a device first'}
									/>
								</div>
								<div>
									<Label style={{ fontSize: '11px', color: 'var(--text-label, #6B7280)', marginBottom: '4px' }}>Peak Demand Meter</Label>
									<Select<MeterOption, false>
										placeholder="Select meter..."
										options={deviceMeterOptions}
										value={meterOptions.find(o => o.value === device.peakDemandMeterId) || null}
										onChange={v => {
											const newDevices = [...(settings.customDashboardDevices || [])];
											newDevices[index] = { ...newDevices[index], peakDemandMeterId: v ? v.value : null };
											updateSettings({ customDashboardDevices: newDevices });
											setSaved(false);
										}}
										styles={dashboardSelectStyles as any}
										menuPortalTarget={document.body}
										menuPosition="fixed"
										isClearable
										noOptionsMessage={() => device.name ? `No meters for ${device.name}` : 'Select a device first'}
									/>
								</div>
								<div>
									<Label style={{ fontSize: '11px', color: 'var(--text-label, #6B7280)', marginBottom: '4px' }}>Power Factor Meter</Label>
									<Select<MeterOption, false>
										placeholder="Select meter..."
										options={deviceMeterOptions}
										value={meterOptions.find(o => o.value === device.powerFactorMeterId) || null}
										onChange={v => {
											const newDevices = [...(settings.customDashboardDevices || [])];
											newDevices[index] = { ...newDevices[index], powerFactorMeterId: v ? v.value : null };
											updateSettings({ customDashboardDevices: newDevices });
											setSaved(false);
										}}
										styles={dashboardSelectStyles as any}
										menuPortalTarget={document.body}
										menuPosition="fixed"
										isClearable
										noOptionsMessage={() => device.name ? `No meters for ${device.name}` : 'Select a device first'}
									/>
								</div>
								<div>
									<Label style={{ fontSize: '11px', color: 'var(--text-label, #6B7280)', marginBottom: '4px' }}>Energy Meter</Label>
									<Select<MeterOption, false>
										placeholder="Select meter..."
										options={deviceMeterOptions}
										value={meterOptions.find(o => o.value === device.energyMeterId) || null}
										onChange={v => {
											const newDevices = [...(settings.customDashboardDevices || [])];
											newDevices[index] = { ...newDevices[index], energyMeterId: v ? v.value : null };
											updateSettings({ customDashboardDevices: newDevices });
											setSaved(false);
										}}
										styles={dashboardSelectStyles as any}
										menuPortalTarget={document.body}
										menuPosition="fixed"
										isClearable
										noOptionsMessage={() => device.name ? `No meters for ${device.name}` : 'Select a device first'}
									/>
								</div>
								<div>
									<Label style={{ fontSize: '11px', color: 'var(--text-label, #6B7280)', marginBottom: '4px' }}>Energy Consumption Meter</Label>
									<Select<MeterOption, true>
										isMulti
										placeholder="Select meters..."
										options={deviceMeterOptions}
										value={meterOptions.filter(o => (device.energyConsumptionMeterIds || []).includes(o.value))}
										onChange={v => {
											const newDevices = [...(settings.customDashboardDevices || [])];
											newDevices[index] = { ...newDevices[index], energyConsumptionMeterIds: v ? v.map(opt => opt.value) : [] };
											updateSettings({ customDashboardDevices: newDevices });
											setSaved(false);
										}}
										styles={dashboardSelectStyles as any}
										menuPortalTarget={document.body}
										menuPosition="fixed"
										isClearable
										noOptionsMessage={() => device.name ? `No meters for ${device.name}` : 'Select a device first'}
									/>
								</div>
							</div>
						</div>
					</div>
					);
				})}

				<Button color="secondary" outline size="sm" style={{ alignSelf: 'flex-start' }} onClick={() => {
					updateSettings({
						customDashboardDevices: [...(settings.customDashboardDevices || []), {
							id: Date.now().toString(),
							name: '',
							totalKwhMeterId: null,
							peakDemandMeterId: null,
							powerFactorMeterId: null,
							energyMeterId: null,
							energyConsumptionMeterIds: []
						}]
					});
					setSaved(false);
				}}>
					+ Add Custom Meter/Device
				</Button>
			</div>

			<hr style={{ margin: '32px 0', borderColor: 'var(--divider-color, #e5e7eb)' }} />
			
			<h5 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: 'var(--text-value, #111827)' }}>Tariff Rate Configuration History</h5>
			<p style={{ fontSize: '12px', color: 'var(--text-label, #6B7280)', marginBottom: '16px' }}>
				Configure the tariff rates used for billing calculations. Add a new configuration with an effective date for it to apply to reports generated from that date onwards. By default, older configurations apply to dates before the new effective date.
			</p>

			<div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
				{(settings.rateHistory || []).map((rate, index) => (
					<div key={index} style={{ padding: '16px', border: '1px solid var(--card-border, #E5E7EB)', borderRadius: '8px', background: 'var(--card-bg, #F9FAFB)' }}>
						<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
							<strong style={{ color: 'var(--text-value, #333)' }}>Effective from: {rate.effectiveDate}</strong>
							<Button size="sm" color="danger" outline onClick={() => {
								const newHistory = [...(settings.rateHistory || [])];
								newHistory.splice(index, 1);
								updateSettings({ rateHistory: newHistory });
								setSaved(false);
							}}>Remove</Button>
						</div>
						<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
							<div>
								<Label style={{ fontSize: '11px', color: 'var(--text-label, #6B7280)', marginBottom: '4px' }}>Tariff Category</Label>
								<Input type="text" bsSize="sm" value={rate.tariffCategory} onChange={e => {
									const newHistory = [...(settings.rateHistory || [])];
									newHistory[index] = { ...newHistory[index], tariffCategory: e.target.value };
									updateSettings({ rateHistory: newHistory });
									setSaved(false);
								}} />
							</div>
							<div>
								<Label style={{ fontSize: '11px', color: 'var(--text-label, #6B7280)', marginBottom: '4px' }}>Energy Rate (₹/unit)</Label>
								<Input type="number" step="0.01" bsSize="sm" value={rate.energyRate} onChange={e => {
									const newHistory = [...(settings.rateHistory || [])];
									newHistory[index] = { ...newHistory[index], energyRate: parseFloat(e.target.value) || 0 };
									updateSettings({ rateHistory: newHistory });
									setSaved(false);
								}} />
							</div>
							<div>
								<Label style={{ fontSize: '11px', color: 'var(--text-label, #6B7280)', marginBottom: '4px' }}>Demand Charge (₹/kVA)</Label>
								<Input type="number" step="0.01" bsSize="sm" value={rate.demandChargeRate} onChange={e => {
									const newHistory = [...(settings.rateHistory || [])];
									newHistory[index] = { ...newHistory[index], demandChargeRate: parseFloat(e.target.value) || 0 };
									updateSettings({ rateHistory: newHistory });
									setSaved(false);
								}} />
							</div>
							<div>
								<Label style={{ fontSize: '11px', color: 'var(--text-label, #6B7280)', marginBottom: '4px' }}>Wheeling Rate (₹/unit)</Label>
								<Input type="number" step="0.01" bsSize="sm" value={rate.wheelingRate} onChange={e => {
									const newHistory = [...(settings.rateHistory || [])];
									newHistory[index] = { ...newHistory[index], wheelingRate: parseFloat(e.target.value) || 0 };
									updateSettings({ rateHistory: newHistory });
									setSaved(false);
								}} />
							</div>
							<div>
								<Label style={{ fontSize: '11px', color: 'var(--text-label, #6B7280)', marginBottom: '4px' }}>FAC Rate (₹/unit)</Label>
								<Input type="number" step="0.01" bsSize="sm" value={rate.facRate} onChange={e => {
									const newHistory = [...(settings.rateHistory || [])];
									newHistory[index] = { ...newHistory[index], facRate: parseFloat(e.target.value) || 0 };
									updateSettings({ rateHistory: newHistory });
									setSaved(false);
								}} />
							</div>
							<div>
								<Label style={{ fontSize: '11px', color: 'var(--text-label, #6B7280)', marginBottom: '4px' }}>Electricity Duty (%)</Label>
								<Input type="number" step="0.01" bsSize="sm" value={rate.electricityDuty} onChange={e => {
									const newHistory = [...(settings.rateHistory || [])];
									newHistory[index] = { ...newHistory[index], electricityDuty: parseFloat(e.target.value) || 0 };
									updateSettings({ rateHistory: newHistory });
									setSaved(false);
								}} />
							</div>
							<div>
								<Label style={{ fontSize: '11px', color: 'var(--text-label, #6B7280)', marginBottom: '4px' }}>Tax on Sale (₹/unit)</Label>
								<Input type="number" step="0.01" bsSize="sm" value={rate.taxOnSale} onChange={e => {
									const newHistory = [...(settings.rateHistory || [])];
									newHistory[index] = { ...newHistory[index], taxOnSale: parseFloat(e.target.value) || 0 };
									updateSettings({ rateHistory: newHistory });
									setSaved(false);
								}} />
							</div>
							<div>
								<Label style={{ fontSize: '11px', color: 'var(--text-label, #6B7280)', marginBottom: '4px' }}>Contract Demand (kVA)</Label>
								<Input type="number" step="0.01" bsSize="sm" value={rate.contractDemand} onChange={e => {
									const newHistory = [...(settings.rateHistory || [])];
									newHistory[index] = { ...newHistory[index], contractDemand: parseFloat(e.target.value) || 0 };
									updateSettings({ rateHistory: newHistory });
									setSaved(false);
								}} />
							</div>
							<div>
								<Label style={{ fontSize: '11px', color: 'var(--text-label, #6B7280)', marginBottom: '4px' }}>Billed Demand (kVA)</Label>
								<Input type="number" step="0.01" bsSize="sm" value={rate.billedDemand ?? 8} onChange={e => {
									const newHistory = [...(settings.rateHistory || [])];
									newHistory[index] = { ...newHistory[index], billedDemand: parseFloat(e.target.value) || 0 };
									updateSettings({ rateHistory: newHistory });
									setSaved(false);
								}} />
							</div>
							<div>
								<Label style={{ fontSize: '11px', color: 'var(--text-label, #6B7280)', marginBottom: '4px' }}>Effective Date</Label>
								<Input type="date" bsSize="sm" value={rate.effectiveDate} onChange={e => {
									const newHistory = [...(settings.rateHistory || [])];
									newHistory[index] = { ...newHistory[index], effectiveDate: e.target.value };
									updateSettings({ rateHistory: newHistory });
									setSaved(false);
								}} />
							</div>
						</div>
					</div>
				))}

				<Button color="secondary" outline size="sm" style={{ alignSelf: 'flex-start' }} onClick={() => {
					const prev = (settings.rateHistory && settings.rateHistory.length > 0) ? settings.rateHistory[settings.rateHistory.length - 1] : {
						effectiveDate: new Date().toISOString().split('T')[0],
						energyRate: 7.76, demandChargeRate: 400, wheelingRate: 1.39, facRate: 0.30, electricityDuty: 7.5, taxOnSale: 0.29, contractDemand: 100, tariffCategory: 'Industrial (LT-V B II)', billedDemand: 8
					};
					updateSettings({
						rateHistory: [...(settings.rateHistory || []), {
							...prev,
							effectiveDate: new Date().toISOString().split('T')[0]
						}]
					});
					setSaved(false);
				}}>
					+ Add Rate Configuration
				</Button>
			</div>

			<Button
				color={saved ? 'success' : 'primary'}
				onClick={handleSaveDashboard}
				style={{ marginTop: '8px' }}
			>
				{saved ? '✓ Saved' : 'Save Dashboard Settings'}
			</Button>
		</section>
	);
}

