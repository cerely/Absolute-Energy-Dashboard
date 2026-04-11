/* eslint-disable jsdoc/require-returns */
import './dashboard.css';
import SimpleLinePage from './SimpleLinePage';
import { CircularProgressbar } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import * as React from 'react';
import { useAppDispatch, useAppSelector } from '../redux/reduxHooks';
import { selectAllMeters, metersApi } from '../redux/api/metersApi';
import { useDashboardSettings } from '../hooks/useDashboardSettings';
import { getDeviceFromIdentifier } from '../utils/meterUtils';
import { MeterData } from '../types/redux/meters';
import { selectTheme, selectSelectedDeviceId, setSelectedDeviceId } from '../redux/slices/appStateSlice';

interface DeviceGroupProps {
	device: string;
	deviceMeters: MeterData[];
	isExpanded: boolean;
	onToggle: (device: string) => void;
}

const DeviceGroup = React.memo(({ device, deviceMeters, isExpanded, onToggle }: DeviceGroupProps) => {
	return (
		<div className="device-group-container">
			<div
				className="device-group-header"
				onClick={() => onToggle(device)}
			>
				<div className="device-info">
					<span className={`material-symbols-rounded expand-icon ${isExpanded ? 'expanded' : ''}`}>
						chevron_right
					</span>
					<span className="material-symbols-rounded device-icon">
						router
					</span>
					<h1 className="device-name">{device}</h1>
				</div>
				<div className="device-count">
					<span>{deviceMeters.length} Telemetry</span>
				</div>
			</div>
			{isExpanded && (
				<div className="device-meters-list show">
					{deviceMeters.map(meter => (
						<div className="meter-status-info" key={meter.id}>
							<div className="meter-stat">
								<div className="stat-icon">
									<span className="material-symbols-rounded" style={{ color: meter.enabled ? '#059669' : '#9CA3AF' }}>
										{meter.enabled ? 'check_circle' : 'cancel'}
									</span>
								</div>
								<div className="stat-heading">
									<h1>{meter.name || meter.identifier}</h1>
									<p>{meter.enabled ? 'Active' : 'Inactive'}</p>
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
});

DeviceGroup.displayName = 'DeviceGroup';


export type DashboardStats = {
	totalKwh: string;
	currentDemand: string;
	demandTrend: 'up' | 'down';
	loadUtil: string;
	energyBudget: string;
	powerFactor: string;
	latestTs: string | null;
};

interface MqttSourceInfo {
	id: number;
	topic: string;
	broker_url: string;
}

export default function DashboardComponents() {
	// Ensure meters are fetched
	metersApi.useGetMetersQuery();

	const allMeters = useAppSelector(selectAllMeters);
	const { settings } = useDashboardSettings();
	const sidebarCollapsed = useAppSelector(state => state.appState.sidebarCollapsed);
	const theme = useAppSelector(selectTheme);
	const isDarkMode = theme === 'dark';

	const dispatch = useAppDispatch();
	const [mqttSources, setMqttSources] = React.useState<MqttSourceInfo[]>([]);
	const [activeSourceId, setActiveSourceId] = React.useState<number | null>(null);
	const selectedDevice = useAppSelector(selectSelectedDeviceId);

	const setSelectedDevice = (id: string | null) => {
		dispatch(setSelectedDeviceId(id));
	};

	// Fetch MQTT sources and active source ID
	React.useEffect(() => {
		const fetchMqttContext = async () => {
			try {
				const mqttRes = await fetch('/api/mqtt');
				if (mqttRes.ok) {
					const data = await mqttRes.json();
					setMqttSources(data.sources || []);
					setActiveSourceId(data.activeId);
				}
			} catch (err) {
				console.error('Error fetching MQTT context', err);
			}
		};
		fetchMqttContext();
	}, []);

	const handleSwitchSource = async (id: number) => {
		try {
			const res = await fetch(`/api/mqtt/active/${id}`, { method: 'PUT' });
			if (res.ok) {
				setActiveSourceId(id);
			}
		} catch (err) {
			console.error('Error switching MQTT source', err);
		}
	};
	
	const [stats, setStats] = React.useState<DashboardStats>({
		totalKwh: '0.00',
		currentDemand: '0.00',
		demandTrend: 'up',
		loadUtil: '0.0',
		energyBudget: '0.0',
		powerFactor: '1.000',
		latestTs: null
	});
	const [lastDisplayed, setLastDisplayed] = React.useState<string>(new Date().toLocaleTimeString());

	React.useEffect(() => {
		const fetchStats = async () => {
			try {
				// Get the active tariff (latest entry by effectiveDate)
				const rateHistory = settings.rateHistory ?? [];
				const activeTariff = rateHistory.length > 0
					? [...rateHistory].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0]
					: null;
				const contractDemand = activeTariff?.contractDemand ?? 100;
				const energyBudgetKwh = settings.energyBudgetKwh ?? 0;
				const energyRate = activeTariff?.energyRate ?? 0;

				const params = new URLSearchParams();
				
				const customDevice = settings.customDashboardDevices?.find(d => d.id === selectedDevice);
				if (customDevice) {
					if (customDevice.totalKwhMeterId) params.set('meters', String(customDevice.totalKwhMeterId));
					if (customDevice.peakDemandMeterId) params.set('demandMeters', String(customDevice.peakDemandMeterId));
					if (customDevice.powerFactorMeterId) params.set('powerFactorMeters', String(customDevice.powerFactorMeterId));
					if (customDevice.energyMeterId) params.set('budgetMeters', String(customDevice.energyMeterId));
				} else {
					if (settings.totalKwhMeterIds && settings.totalKwhMeterIds.length > 0) {
						params.set('meters', settings.totalKwhMeterIds.join(','));
					}
					if (settings.currentDemandMeterIds && settings.currentDemandMeterIds.length > 0) {
						params.set('demandMeters', settings.currentDemandMeterIds.join(','));
					}
					if (settings.powerFactorMeterIds && settings.powerFactorMeterIds.length > 0) {
						params.set('powerFactorMeters', settings.powerFactorMeterIds.join(','));
					}
				}

				params.set('contractDemand', String(contractDemand));
				params.set('energyBudgetKwh', String(energyBudgetKwh));
				params.set('energyRate', String(energyRate));
				// Pass active MQTT source to filter stats
				if (activeSourceId) {
					params.set('sourceId', String(activeSourceId));
				}

				const res = await fetch(`/api/dashboard/stats?${params.toString()}`);
				if (res.ok) {
					const data = await res.json();
					setStats(data);
					setLastDisplayed(new Date().toLocaleTimeString());
				}
			} catch (err) {
				console.error('Error fetching dashboard stats', err);
			}
		};
		fetchStats();
		const interval = setInterval(fetchStats, 10000); // 10s refresh
		return () => clearInterval(interval);
	}, [settings, activeSourceId, selectedDevice]);

	// ✅ Trigger window resize when sidebar toggles to refresh graphs
	React.useEffect(() => {
		const timer = setTimeout(() => {
			window.dispatchEvent(new Event('resize'));
		}, 350); // Slightly more than the 300ms transition
		return () => clearTimeout(timer);
	}, [sidebarCollapsed]);

	const filteredMeters = React.useMemo(() => {
		if (!allMeters) return [];
		let meters = allMeters.filter(m => m.enabled);
		// Filter by active MQTT source using mqttSourceId on each meter
		if (activeSourceId !== null) {
			meters = meters.filter(m => m.mqttSourceId === activeSourceId);
		}
		// If meter status meters are configured in settings, filter to those
		if (settings.meterStatusMeterIds.length > 0) {
			const statusSet = new Set(settings.meterStatusMeterIds);
			meters = meters.filter(m => statusSet.has(m.id));
		}
		return meters.slice(0, 1000); // Limit to 1000 for performance
	}, [allMeters, settings.meterStatusMeterIds, activeSourceId]);

	const [expandedDevices, setExpandedDevices] = React.useState<Record<string, boolean>>({});

	const toggleDevice = (device: string) => {
		setExpandedDevices(prev => ({
			...prev,
			[device]: !prev[device]
		}));
	};

	const groupedMeters = React.useMemo(() => {
		const groups: Record<string, typeof filteredMeters> = {};
		filteredMeters.forEach(meter => {
			const device = getDeviceFromIdentifier(meter.identifier);
			if (!groups[device]) groups[device] = [];
			groups[device].push(meter);
		});
		return groups;
	}, [filteredMeters]);

	React.useEffect(() => {
		if (settings.customDashboardDevices && settings.customDashboardDevices.length > 0) {
			const devices = settings.customDashboardDevices.map(d => d.id);
			if (!selectedDevice && devices.length > 0) {
				setSelectedDevice(devices[0]);
			} else if (selectedDevice && !devices.includes(selectedDevice)) {
				setSelectedDevice(devices.length > 0 ? devices[0] : null);
			}
		} else {
			const devices = Object.keys(groupedMeters);
			if (!selectedDevice && devices.length > 0) {
				setSelectedDevice(devices[0]);
			} else if (selectedDevice && !devices.includes(selectedDevice)) {
				setSelectedDevice(devices.length > 0 ? devices[0] : null);
			}
		}
	}, [groupedMeters, selectedDevice, settings.customDashboardDevices]);

	const customDevice = settings.customDashboardDevices?.find(d => d.id === selectedDevice);

	const isTotalKwhMapped = selectedDevice && (customDevice 
		? !!customDevice.totalKwhMeterId 
		: !!selectedDevice);
		
	const isDemandMapped = selectedDevice && (customDevice 
		? !!customDevice.peakDemandMeterId 
		: !!selectedDevice);
		
	const isPowerFactorMapped = selectedDevice && (customDevice 
		? !!customDevice.powerFactorMeterId 
		: !!selectedDevice);

	return (
		<main>
			<div className="main-grids">
				<div className="grid-item">
					<div className="total-head" >
						<div className="total-topic">
							<div className="readin-headin">
								<div className="total-head-1">
									<div className="card-icon" style={{ backgroundColor: isDarkMode ? '#FF007F' : '#84CC44' }}>
										<span className="material-symbols-rounded">
											insights
										</span>
									</div>
									<h1 className="card-title">Total kWh Usage</h1>
								</div>
								<div className="total-status">
									<div className="total-status-stat">
										<span className="material-symbols-rounded status-icon">
											trending_up
										</span>
										<span className="status-text">Live</span>
									</div>
								</div>
							</div>
							<div className="readin-total">
								<div className="today-total">
									<p className="today-total" style={{ color: isDarkMode ? '#FF007F' : undefined }}>
										{isTotalKwhMapped ? stats.totalKwh : 'N/A'} <span style={{ fontSize: '0.6em', fontWeight: 500, letterSpacing: 0 }}>kWh</span>
									</p>
								</div>
								<div className="yesterday-total" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '2px', marginTop: '4px' }}>
									<p className="total-date" style={{ fontSize: '13px', color: isDarkMode ? '#8b949e' : '#6B7280', margin: 0 }}>Last updated: {lastDisplayed}</p>
								</div>
							</div>
						</div>
					</div>
					<div className="load-utilization">
						<div className="load-util">
							<div className="load-heading">
								<div className="load-icon">
									<div className="card-icon" style={{ backgroundColor: isDarkMode ? '#FFCC00' : 'var(--load-util-color)' }}>
										<span className="material-symbols-rounded">
											bolt
										</span>
									</div>
									<h1 className="card-title">Power Factor</h1>
								</div>
								{/* Color coding logic: Green > 0.95, Red < 0.9, Theme otherwise */}
								<div className="load-status" style={{ 
									background: parseFloat(stats.powerFactor) > 0.95 
										? 'rgba(16, 185, 129, 0.15)' 
										: parseFloat(stats.powerFactor) < 0.9 
											? 'rgba(239, 68, 68, 0.15)' 
											: 'rgba(255, 0, 127, 0.15)', // Theme Pink
									color: parseFloat(stats.powerFactor) > 0.95	 
										? '#10b981' 
										: parseFloat(stats.powerFactor) < 0.9 
											? '#ef4444' 
											: '#FF007F' // Theme Pink
								}}>
									<span className="material-symbols-rounded status-icon" style={{ 
										color: parseFloat(stats.powerFactor) > 0.95 ? '#10b981' : parseFloat(stats.powerFactor) < 0.9 ? '#ef4444' : '#FF007F' 
									}}>
										{parseFloat(stats.powerFactor) > 0.95 ? 'verified' : parseFloat(stats.powerFactor) < 0.9 ? 'warning' : 'info'}
									</span>
									<span className="status-text">
										{parseFloat(stats.powerFactor) > 0.95 ? 'Excellent' : parseFloat(stats.powerFactor) < 0.9 ? 'Poor' : 'Good'}
									</span>
								</div>
							</div>
							<div className="load-prog-ring" style={{ width: '140px', height: '140px', margin: '16px auto' }}>
								<CircularProgressbar
									value={isPowerFactorMapped ? parseFloat(stats.powerFactor) * 100 : 0}
									text={isPowerFactorMapped ? stats.powerFactor : 'N/A'}
									strokeWidth={10}
									styles={{
										text: {
											fontSize: '22px',
											fontWeight: '700',
											fill: isDarkMode ? '#FFCC00' : '#393185'
										},
										path: {
											stroke: isDarkMode ? '#FFCC00' : '#393185',
											transition: 'stroke-dashoffset 0.8s ease 0s'
										},
										trail: {
											stroke: 'var(--gauge-bg)'
										}
									}}
								/>
							</div>
							<div className="load-line"></div>
							<div className="load-text">
								<p>Real-time efficiency monitor (kWh/kVAh)</p>
							</div>
						</div>
					</div>
					<div className="energy-budget">
						<div className="energy-util">
							<div className="energy-heading">
								<div className="energy-icon">
									<div className="card-icon" style={{ backgroundColor: isDarkMode ? '#FF007F' : 'var(--energy-budget-color)' }}>
										<span className="material-symbols-rounded">
											finance
										</span>
									</div>
									<h1 className="card-title">Energy Budget</h1>
								</div>
								<div className="energy-status" style={{ background: parseFloat(stats.energyBudget) >= 80 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)' }}>
									<span className="material-symbols-rounded status-icon" style={{ color: parseFloat(stats.energyBudget) >= 80 ? '#ef4444' : '#10b981' }}>
										{parseFloat(stats.energyBudget) >= 80 ? 'trending_up' : 'trending_flat'}
									</span>
									<span className="energy-status-text" style={{ color: parseFloat(stats.energyBudget) >= 80 ? '#ef4444' : '#10b981' }}>
										{parseFloat(stats.energyBudget) >= 80 ? 'High' : 'Normal'}
									</span>
								</div>
							</div>
							<div className="energy-prog-ring" style={{ width: '140px', height: '140px', margin: '16px auto' }}>
								<CircularProgressbar
									value={isTotalKwhMapped && settings.energyBudgetKwh ? parseFloat(stats.energyBudget) : 0}
									text={isTotalKwhMapped && settings.energyBudgetKwh ? `${parseFloat(stats.energyBudget).toFixed(0)}%` : 'N/A'}
									strokeWidth={10}
									styles={{
										text: {
											fontSize: '22px',
											fontWeight: '700',
											fill: isDarkMode ? '#FF007F' : 'var(--energy-budget-color)'
										},
										path: {
											stroke: isDarkMode ? '#FF007F' : 'var(--energy-budget-color)',
											transition: 'stroke-dashoffset 0.8s ease 0s'
										},
										trail: {
											stroke: 'var(--gauge-bg)'
										}
									}}
								/>
							</div>
							<div className="energy-line"></div>
							<div className="energy-text">
								<p>Budget limit status</p>
							</div>
						</div>
					</div>
					<div className="meter-status">
						<div className="meter-body">
							<div className="meter-heading">
								<div className="meter-head-text" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
									<div className="card-icon" style={{ backgroundColor: isDarkMode ? '#FF007F' : 'var(--load-util-color)' }}>
										<span className="material-symbols-rounded">
											router
										</span>
									</div> 
									<h1 className="card-title">Devices</h1>
								</div>
								<div className="energy-status">
									<span className="material-symbols-rounded status-icon">
										electric_bolt
									</span>
									<span className="energy-status-text">
										{filteredMeters.length} Active Telemetry
									</span>
								</div>

							</div>
							<div className="meter-list-container" style={{ overflowY: 'auto', flex: 1 }}>
								{(() => {
									// Determine which device name to filter by
									let filterDeviceName: string | null = null;
									if (selectedDevice) {
										if (settings.customDashboardDevices && settings.customDashboardDevices.length > 0) {
											const customDev = settings.customDashboardDevices.find(d => d.id === selectedDevice);
											filterDeviceName = customDev?.name || null;
										} else {
											filterDeviceName = selectedDevice;
										}
									}
									
									const entriesToShow = filterDeviceName
										? Object.entries(groupedMeters).filter(([device]) => device === filterDeviceName)
										: Object.entries(groupedMeters);
									
									return entriesToShow.map(([device, deviceMeters]) => (
										<DeviceGroup
											key={device}
											device={device}
											deviceMeters={deviceMeters}
											isExpanded={!!expandedDevices[device]}
											onToggle={toggleDevice}
										/>
									));
								})()}
								{filteredMeters.length === 0 && (
									<div className="meter-status-info">
										<div className="meter-stat">
											<p style={{ padding: '10px', color: '#6B7280' }}>No devices found.</p>
										</div>
									</div>
								)}
							</div>

						</div>
					</div>
					<div style={{ gridArea: 'filter', background: isDarkMode ? '#161b22' : '#ffffff', borderRadius: '20px', border: isDarkMode ? '1px solid #30363d' : '1px solid #E5E7EB', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden', height: '100%', boxSizing: 'border-box', boxShadow: isDarkMode ? '0 4px 12px rgba(0,0,0,0.4)' : undefined }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
							<div className="card-icon" style={{ backgroundColor: isDarkMode ? '#00F2EA' : '#84CC44' }}>
								<span className="material-symbols-rounded">tune</span>
							</div>
							<h2 className="card-title" style={{ fontSize: '18px' }}>Filters</h2>
						</div>
						<div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
							<span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Selected Meter</span>
							{(() => {
								if (settings.customDashboardDevices && settings.customDashboardDevices.length > 0) {
									const dev = settings.customDashboardDevices.find(d => d.id === selectedDevice);
									const displayLabel = dev?.label || dev?.name || 'N/A';
									const deviceName = dev?.name || '';
									return (
										<>
											<h1 style={{ fontSize: '22px', fontWeight: '700', margin: 0, color: isDarkMode ? '#ffffff' : '#000', letterSpacing: '-0.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
												{displayLabel}
											</h1>
											{dev?.label && deviceName && (
												<span style={{ fontSize: '12px', color: isDarkMode ? '#8b949e' : '#6B7280', marginTop: '1px', fontWeight: 400 }}>
													{deviceName}
												</span>
											)}
										</>
									);
								}
								return (
									<h1 style={{ fontSize: '22px', fontWeight: '700', margin: 0, color: isDarkMode ? '#ffffff' : '#000', letterSpacing: '-0.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
										{selectedDevice || 'N/A'}
									</h1>
								);
							})()}
						</div>

						<hr style={{ border: 'none', borderTop: isDarkMode ? '1px solid #30363d' : '1px solid #E5E7EB', margin: '8px 0px', flexShrink: 0 }} />

						<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', overflowY: 'auto', flex: 1, minHeight: 0, alignContent: 'flex-start' }}>
							{settings.customDashboardDevices && settings.customDashboardDevices.length > 0 ? (
								settings.customDashboardDevices.map(device => (
									<button 
										key={device.id}
										onClick={() => setSelectedDevice(device.id)}
										className="filter-device-btn"
										style={{ 
											padding: '8px 16px', 
											borderRadius: '12px', 
											border: selectedDevice === device.id ? 'none' : isDarkMode ? '1px solid #30363d' : '1px solid #E5E7EB',
											background: selectedDevice === device.id 
												? (isDarkMode ? '#0d1117' : '#393185') 
												: isDarkMode ? '#21262d' : '#F3F4F6',
											color: selectedDevice === device.id 
												? (isDarkMode ? '#00F2EA' : '#ffffff') 
												: isDarkMode ? '#e6edf3' : '#374151',
											cursor: 'pointer',
											fontSize: '13px',
											fontWeight: '600',
											whiteSpace: 'nowrap',
											transition: 'all 0.2s ease',
											boxShadow: selectedDevice === device.id ? '0 4px 12px rgba(57, 49, 133, 0.2)' : 'none'
										}}
									>
										{device.label || device.name}
									</button>
								))
							) : (
								Object.keys(groupedMeters).map(device => (
									<button 
										key={device}
										onClick={() => setSelectedDevice(device)}
										className="filter-device-btn"
										style={{ 
											padding: '8px 16px', 
											borderRadius: '12px', 
											border: selectedDevice === device ? 'none' : isDarkMode ? '1px solid #30363d' : '1px solid #E5E7EB',
											background: selectedDevice === device 
												? (isDarkMode ? '#0d1117' : '#393185') 
												: isDarkMode ? '#21262d' : '#F3F4F6',
											color: selectedDevice === device 
												? (isDarkMode ? '#00F2EA' : '#ffffff') 
												: isDarkMode ? '#e6edf3' : '#374151',
											cursor: 'pointer',
											fontSize: '13px',
											fontWeight: '600',
											whiteSpace: 'nowrap',
											transition: 'all 0.2s ease',
											boxShadow: selectedDevice === device ? '0 4px 12px rgba(57, 49, 133, 0.2)' : 'none'
										}}
									>
										{device}
									</button>
								))
							)}
						</div>

						<div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', paddingTop: '8px', borderTop: isDarkMode ? '1px solid #30363d' : '1px solid #E5E7EB', marginTop: '4px', flexShrink: 0 }}>
							<span className="material-symbols-rounded" style={{ fontSize: '16px', color: '#9CA3AF', flexShrink: 0 }}>info</span>
							<span style={{ fontSize: '11px', color: '#9CA3AF', lineHeight: '1.2' }}>Selected meter will be used to display the dashboard data</span>
						</div>
					</div>
					<div className="peak-demand total-head" style={{ gridArea: 'peak' }}>
						<div className="total-topic">
							<div className="readin-headin">
								<div className="total-head-1">
									<div className="card-icon" style={{ backgroundColor: isDarkMode ? '#00F2EA' : '#00A3FF' }}>
										<span className="material-symbols-rounded">
											speed
										</span>
									</div>
									<h1 className="card-title">Current Demand</h1>
								</div>
								<div className="total-status">
									<div className="total-status-stat" style={{ 
										background: stats.demandTrend === 'up' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
										color: stats.demandTrend === 'up' ? '#ef4444' : '#10b981'
									}}>
										<span className="material-symbols-rounded status-icon">
											{stats.demandTrend === 'up' ? 'trending_up' : 'trending_down'}
										</span>
										<span className="status-text">{stats.demandTrend === 'up' ? 'Rising' : 'Falling'}</span>
									</div>
								</div>
							</div>
							<div className="readin-total">
								<div className="today-total">
									<p className="today-total" style={{ color: isDarkMode ? '#00F2EA' : '#111111' }}>
										{isDemandMapped ? stats.currentDemand : 'N/A'} <span style={{ fontSize: '0.6em', fontWeight: 500, letterSpacing: 0, color: '#8b949e' }}>kW</span>
									</p>
								</div>
								<div className="yesterday-total" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '2px', marginTop: '4px' }}>
									<p className="total-date" style={{ fontSize: '13px', color: isDarkMode ? '#8b949e' : '#6B7280', margin: 0 }}>Last updated: {lastDisplayed}</p>
								</div>
							</div>
						</div>
					</div>
					<div className="energy-consumption-graph">
						<div className="energy-body">
							<div className="energy-graph-heading">
								<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
							<div className="card-icon" style={{ backgroundColor: isDarkMode ? '#FFCC00' : 'var(--load-util-color)' }}>
								<span className="material-symbols-rounded">electric_bolt</span>
							</div>
							<h1 className="card-title">Energy Consumption</h1>
						</div>
								{/* <div className="energy-graph-values">
									<div className="graph-v1">
										<div className="value-color-1"></div>
										<div className="value-name"><p>Absfloor2/30084_kWh1</p></div>
									</div>
									<div className="graph-v1">
										<div className="value-color-2"></div>
										<div className="value-name"><p>Absfloor2/30084_kWh1</p></div>
									</div>
								</div> */}
								<div className="energy-graph-stat">
									<div className="energy-graph-cont">
										<div className="live-icon"></div>
										<div className="live-text"><p>Live</p></div>
									</div>
								</div>
							</div>
							{/* <EnergyGraph /> */}
						</div>
						<div
							className="energy-graph-wrapper"
							style={{
								marginLeft: 0,
								position: 'relative',
								borderRadius: 40,
								zIndex: 0,
								marginTop: 0,
								overflow: 'hidden'
							}}
						>
							<SimpleLinePage selectedDeviceId={selectedDevice} />
						</div>
					</div>
				</div>
			</div>
		</main>
	);
}
