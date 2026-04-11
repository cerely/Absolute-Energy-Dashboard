/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'oed_dashboard_settings';

export interface DashboardMeterConfig {
	id: number;
	name: string;
}

export interface TariffRateConfig {
	effectiveDate: string;
	energyRate: number;
	demandChargeRate: number;
	wheelingRate: number;
	facRate: number;
	electricityDuty: number;
	taxOnSale: number;
	contractDemand: number;
	tariffCategory: string;
	billedDemand: number;
}

export interface CustomDashboardDevice {
	id: string;
	name: string; // Device name from topic (e.g. "EM1")
	label?: string; // Display label shown on the dashboard filter card
	totalKwhMeterId?: number | null;
	peakDemandMeterId?: number | null;
	powerFactorMeterId?: number | null;
	energyMeterId?: number | null;
	energyConsumptionMeterIds?: number[];
}

/** Time-of-Day rate slots (Offset from base rate in ₹/kWh, can be negative) */
export interface TodRates {
	/** 22:00 – 06:00 (off-peak / night) */
	slot_2206: number;
	/** 06:00 – 09:00 (morning shoulder) */
	slot_0609: number;
	/** 09:00 – 12:00 (morning peak) */
	slot_0912: number;
	/** 12:00 – 18:00 (afternoon peak) */
	slot_1218: number;
	/** 18:00 – 22:00 (evening peak) */
	slot_1822: number;
}

export interface DashboardSettings {
	dashboardMeterIds: number[];
	meterStatusMeterIds: number[];
	totalKwhMeterIds: number[];
	currentDemandMeterIds: number[];
	powerFactorMeterIds: number[];
	defaultAddress?: string;
	defaultActivity?: string;
	reportMeterId?: number | null;
	reportKvahMeterId?: number | null;
	dashboardGraphDays?: number;
	rateHistory?: TariffRateConfig[];
	energyBudgetKwh?: number;
	/** Time-of-Day energy rates (Offset from base rate in ₹/kWh) */
	todRates?: TodRates;
	customDashboardDevices?: CustomDashboardDevice[];
}

const defaultSettings: DashboardSettings = {
	dashboardMeterIds: [],
	meterStatusMeterIds: [],
	totalKwhMeterIds: [],
	currentDemandMeterIds: [],
	powerFactorMeterIds: [],
	defaultAddress: '',
	defaultActivity: '',
	reportMeterId: null,
	reportKvahMeterId: null,
	dashboardGraphDays: 1,
	energyBudgetKwh: 0,
	todRates: {
		slot_2206: 0.00,
		slot_0609: 0.00,
		slot_0912: -1.94,
		slot_1218: 0.00,
		slot_1822: -1.94
	},
	rateHistory: [{
		effectiveDate: '2000-01-01',
		energyRate: 7.76,
		demandChargeRate: 400,
		wheelingRate: 1.39,
		facRate: 0.30,
		electricityDuty: 7.5,
		taxOnSale: 0.29,
		contractDemand: 100,
		tariffCategory: 'Industrial (LT-V B II)',
		billedDemand: 8
	}],
	customDashboardDevices: []
};

/**
 * Hook to read and write dashboard settings from the backend database.
 * Settings include which meters appear on the main dashboard chart,
 * tariff rates, energy budget, and custom device mappings.
 */
export function useDashboardSettings() {
	const [settings, setSettings] = useState<DashboardSettings>(defaultSettings);
	const [isLoaded, setIsLoaded] = useState(false);

	// Initial load from backend
	useEffect(() => {
		const fetchSettings = async () => {
			try {
				const res = await fetch('/api/dashboard/settings');
				if (res.ok) {
					const data = await res.json();
					if (data && Object.keys(data).length > 0) {
						// Merge default values for missing keys
						setSettings({
							...defaultSettings,
							...data
						});
					} else {
						// Fallback to localStorage if server has no data yet (migration)
						const local = localStorage.getItem(STORAGE_KEY);
						if (local) {
							try {
								const parsed = JSON.parse(local);
								setSettings({ ...defaultSettings, ...parsed });
								// Migration: Save to backend
								fetch('/api/dashboard/settings', {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: local
								});
							} catch (e) {}
						}
					}
				}
			} catch (err) {
				console.error('Error fetching dashboard settings', err);
			} finally {
				setIsLoaded(true);
			}
		};
		fetchSettings();
	}, []);

	const updateSettings = useCallback((partial: Partial<DashboardSettings>) => {
		setSettings(prev => {
			const next = { ...prev, ...partial };
			// Save to backend
			fetch('/api/dashboard/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(next)
			}).catch(err => console.error('Error saving settings', err));
			
			// Also sync to localStorage as secondary backup
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
			} catch {}

			return next;
		});
	}, []);

	return { settings, updateSettings, isLoaded };
}

/**
 * Standalone getter - Note: This is now less useful as it doesn't wait for the server.
 * Use useDashboardSettings hook wherever possible.
 */
export function getDashboardSettings(): DashboardSettings {
	const local = localStorage.getItem(STORAGE_KEY);
	if (local) {
		try {
			return { ...defaultSettings, ...JSON.parse(local) };
		} catch (e) {}
	}
	return defaultSettings;
}
