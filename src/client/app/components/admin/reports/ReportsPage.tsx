import * as React from 'react';
import { useAppSelector } from '../../../redux/reduxHooks';
import { selectTheme } from '../../../redux/slices/appStateSlice';
import { selectCurrentUserProfile } from '../../../redux/slices/currentUserSlice';
import { preferencesApi } from '../../../redux/api/preferencesApi';
import { useDashboardSettings } from '../../../hooks/useDashboardSettings';
import { selectAllMeters } from '../../../redux/api/metersApi';
import { defaultAdminState } from '../../../redux/slices/adminSlice';
import TooltipHelpComponent from '../../TooltipHelpComponent';
import '../../dashboard.css';

const METER_ID = 16;
const GRAPHIC_UNIT_ID = 6; // kWh

const TOD_ZONES = [
	{ name: 'Night', time: '22:00 - 06:00', rate: -1.5, badge: 'Off-Peak', badgeClass: 'b-offpeak' },
	{ name: 'Morning', time: '06:00 - 09:00', rate: 0, badge: 'Normal', badgeClass: 'b-normal' },
	{ name: 'Peak Early', time: '09:00 - 12:00', rate: 0.8, badge: 'Normal', badgeClass: 'b-normal' },
	{ name: 'Evening', time: '12:00 - 18:00', rate: 0, badge: 'Normal', badgeClass: 'b-normal' },
	{ name: 'Peak Late', time: '18:00 - 22:00', rate: 1.1, badge: 'Peak', badgeClass: 'b-peak' }
];

function getTODZone(hour: number) {
	if (hour >= 22 || hour < 6) return 'Night';
	if (hour >= 6 && hour < 9) return 'Morning';
	if (hour >= 9 && hour < 12) return 'Peak Early';
	if (hour >= 12 && hour < 18) return 'Evening';
	return 'Peak Late';
}

function preprocessData(data: any[]) {
	return data.sort((a: any, b: any) => a.startTimestamp - b.startTimestamp);
}

function getRateForTimestamp(timestamp: number, rateHistory: any[]) {
	if (!rateHistory || rateHistory.length === 0) return null;
	const sorted = [...rateHistory].sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());
	for (const rate of sorted) {
		const rateDate = new Date(`${rate.effectiveDate}T00:00:00Z`).getTime();
		if (timestamp >= rateDate) {
			return rate;
		}
	}
	return sorted[sorted.length - 1];
}

function getClosestReading(data: any[], targetTs: number) {
	if (!data || data.length === 0) return null;
	let closest = data[0];
	let minDiff = Math.abs(data[0].startTimestamp - targetTs);
	for (let i = 1; i < data.length; i++) {
		const diff = Math.abs(data[i].startTimestamp - targetTs);
		if (diff < minDiff) {
			minDiff = diff;
			closest = data[i];
		}
	}
	// Allow up to 4 hours gap in case of missing data
	if (minDiff > 4 * 3600 * 1000) return null;
	return closest;
}

function calculateTOD(
	meterData: any[],
	kvahDataRaw: any[],
	startDate: string,
	endDate: string,
	rateHistory: any[],
	todRates: import('../../../hooks/useDashboardSettings').TodRates | undefined
) {
	const bucketMap: Record<string, { kwh: number, kvah: number, start: number | null, end: number | null, baseCharges: number, todCharges: number, totalCharges: number }> = {};
	TOD_ZONES.forEach(z => (bucketMap[z.name] = { kwh: 0, kvah: 0, start: null, end: null, baseCharges: 0, todCharges: 0, totalCharges: 0 }));

	const startTs = new Date(`${startDate}T00:00:00+05:30`).getTime();

	const rateConfig = getRateForTimestamp(startTs, rateHistory);
	const energyRate = rateConfig ? rateConfig.energyRate : 7.76;
	const wheelingRate = rateConfig ? rateConfig.wheelingRate : 1.39;
	const facRate = rateConfig ? rateConfig.facRate : 0.30;
	const electricityDutyPct = rateConfig ? rateConfig.electricityDuty : 7.5;
	const taxOnSaleRate = rateConfig ? rateConfig.taxOnSale : 0.29;
	let currentTariffCategory = rateConfig?.tariffCategory || 'Industrial (LT-V B II)';
	let currentContractDemand = rateConfig?.contractDemand || 100;
	let currentDemandChargeRate = rateConfig?.demandChargeRate || 400;
	let currentBilledDemand = rateConfig?.billedDemand ?? 8;

	const startLocal = new Date(`${startDate}T00:00:00+05:30`);
	const endLocal = new Date(`${endDate}T00:00:00+05:30`);
	let currentDate = new Date(startLocal.getTime());

	while (currentDate.getTime() <= endLocal.getTime()) {
		const year = currentDate.getFullYear();
		const month = String(currentDate.getMonth() + 1).padStart(2, '0');
		const day = String(currentDate.getDate()).padStart(2, '0');

		let prevDate = new Date(currentDate.getTime() - 24 * 3600 * 1000);
		const pYear = prevDate.getFullYear();
		const pMonth = String(prevDate.getMonth() + 1).padStart(2, '0');
		const pDay = String(prevDate.getDate()).padStart(2, '0');

		const t22_prev = new Date(`${pYear}-${pMonth}-${pDay}T22:00:00+05:30`).getTime();
		const t06 = new Date(`${year}-${month}-${day}T06:00:00+05:30`).getTime();
		const t09 = new Date(`${year}-${month}-${day}T09:00:00+05:30`).getTime();
		const t12 = new Date(`${year}-${month}-${day}T12:00:00+05:30`).getTime();
		const t18 = new Date(`${year}-${month}-${day}T18:00:00+05:30`).getTime();
		const t22 = new Date(`${year}-${month}-${day}T22:00:00+05:30`).getTime();

		const boundaries = [
			{ bucket: 'Night', startTs: t22_prev, endTs: t06 },
			{ bucket: 'Morning', startTs: t06, endTs: t09 },
			{ bucket: 'Peak Early', startTs: t09, endTs: t12 },
			{ bucket: 'Evening', startTs: t12, endTs: t18 },
			{ bucket: 'Peak Late', startTs: t18, endTs: t22 }
		];

		let dailyKwhSum = 0;
		let dailyKvahSum = 0;

		boundaries.forEach(b => {
			const startKwh = getClosestReading(meterData, b.startTs);
			const endKwh = getClosestReading(meterData, b.endTs);
			let diffKwh = 0;
			if (startKwh && endKwh && endKwh.reading >= startKwh.reading) {
				diffKwh = endKwh.reading - startKwh.reading;
				bucketMap[b.bucket].kwh += diffKwh;
			}

			const startKvah = getClosestReading(kvahDataRaw, b.startTs);
			const endKvah = getClosestReading(kvahDataRaw, b.endTs);
			let diffKvah = 0;
			if (startKvah && endKvah && endKvah.reading >= startKvah.reading) {
				diffKvah = endKvah.reading - startKvah.reading;
				bucketMap[b.bucket].kvah += diffKvah;
			}

			dailyKwhSum += diffKwh;
			dailyKvahSum += diffKvah;
		});

		currentDate = new Date(currentDate.getTime() + 24 * 3600 * 1000);
	}

	let totalUnits = 0;
	TOD_ZONES.forEach(z => {
		const data = bucketMap[z.name];

		let dynamicTodRate = z.rate;
		if (todRates) {
			if (z.name === 'Night') dynamicTodRate = todRates.slot_2206;
			if (z.name === 'Morning') dynamicTodRate = todRates.slot_0609;
			if (z.name === 'Peak Early') dynamicTodRate = todRates.slot_0912;
			if (z.name === 'Evening') dynamicTodRate = todRates.slot_1218;
			if (z.name === 'Peak Late') dynamicTodRate = todRates.slot_1822;
		}

		data.baseCharges = data.kwh * energyRate;
		data.todCharges = data.kwh * dynamicTodRate;
		data.totalCharges = data.baseCharges + data.todCharges;

		totalUnits += data.kwh;
	});

	return { bucketMap, currentTariffCategory, currentContractDemand, currentDemandChargeRate, currentBilledDemand, energyRate, wheelingRate, facRate, electricityDutyPct, taxOnSaleRate };
}

// @ts-ignore
const html2canvas = (require('html2canvas') as any);
const { jsPDF } = (require('jspdf') as any);

/**
 * @returns radar plotly component
 */
export default function ReportsPage() {
	const theme = useAppSelector(selectTheme);
	const userProfile = useAppSelector(selectCurrentUserProfile);
	const { data: adminPreferences = defaultAdminState } = preferencesApi.useGetPreferencesQuery();
	const { settings, updateSettings } = useDashboardSettings();
	const allMeters = useAppSelector(selectAllMeters);
	const isDarkMode = theme === 'dark';

	const METER_ID = settings.reportMeterId || 16;
	const selectedMeter = allMeters?.find(m => m.id === METER_ID);
	const meterName = selectedMeter ? (selectedMeter.identifier || selectedMeter.name) : '055-X1807184';

	const [startDate, setStartDate] = React.useState<string>(() => {
		const d = new Date(); d.setDate(1);
		return d.toISOString().split('T')[0];
	});
	const [endDate, setEndDate] = React.useState<string>(new Date().toISOString().split('T')[0]);
	const [generating, setGenerating] = React.useState(false);
	const [reportData, setReportData] = React.useState<any | null>(null);
	const [error, setError] = React.useState<string>('');
	const [saving, setSaving] = React.useState(false);
	const [savedMsg, setSavedMsg] = React.useState<string>('');

	const handleGenerate = async () => {
		setGenerating(true);
		setError('');
		setReportData(null);
		try {
			// Fetch from 1 day before to safely grab prev22:00 interpolations for the very first day
			const startTs = new Date(`${startDate}T00:00:00+05:30`).getTime();
			const from = new Date(startTs - 24 * 3600 * 1000).toISOString();
			const to = new Date(`${endDate}T23:59:59.999+05:30`).toISOString();
			// --- Fetch additional meter metrics ---
			const getSiblingMeter = (tokens: string[]) => {
				if (!selectedMeter || !allMeters) return null;
				// Attempt to extract the device prefix (e.g. Device01/kWh_Import -> Device01/)
				const basePathMatch = selectedMeter.identifier.match(/^(.*\/)/);
				const basePath = basePathMatch ? basePathMatch[1] : selectedMeter.identifier.replace(/kwh.*$/i, '');

				return allMeters.find(m => {
					const mLower = m.identifier.toLowerCase();
					return mLower.startsWith(basePath.toLowerCase()) &&
						tokens.some(t => mLower.includes(t)) &&
						m.id !== selectedMeter.id;
				});
			};

			const kvahMeter = settings.reportKvahMeterId
				? allMeters?.find(m => m.id === settings.reportKvahMeterId)
				: getSiblingMeter(['kvah']);
			const lagMeter = getSiblingMeter(['kvarh_lag', 'rkvah_lag']);
			const leadMeter = getSiblingMeter(['kvarh_lead', 'rkvah_lead']);
			const kwMeter = getSiblingMeter(['md_kw', 'kw_md', 'kw']);
			const kvaMeter = getSiblingMeter(['md_kva', 'kva_md', 'kva']);

			const fetchMetric = async (meter: any, isPower: boolean) => {
				if (!meter) return { value: 0, start: 0, end: 0, raw: [] };
				try {
					const mRes = await fetch(`/api/unitReadings/line/meters/${meter.id}?timeInterval=${from}_${to}&graphicUnitId=${meter.defaultGraphicUnit}`);
					if (!mRes.ok) return { value: 0, start: 0, end: 0, raw: [] };
					const mData = await mRes.json();
					const list = preprocessData(mData[String(meter.id)] || []);
					if (list.length === 0) return { value: 0, start: 0, end: 0, raw: [] };
					if (isPower) {
						return { value: Math.max(...list.map((d: any) => d.reading)), start: 0, end: 0, raw: list };
					} else {
						return {
							value: list[list.length - 1].reading - list[0].reading,
							start: list[0].reading,
							end: list[list.length - 1].reading,
							raw: list
						};
					}
				} catch {
					return { value: 0, start: 0, end: 0, raw: [] };
				}
			};

			const [kwhData, kvahData, lagData, leadData, kwData, kvaData] = await Promise.all([
				fetchMetric(selectedMeter, false),
				fetchMetric(kvahMeter, false),
				fetchMetric(lagMeter, false),
				fetchMetric(leadMeter, false),
				fetchMetric(kwMeter, true),
				fetchMetric(kvaMeter, true)
			]);

			const fetchedKvah = kvahData.value;
			const fetchedLag = lagData.value;
			const fetchedLead = leadData.value;
			const fetchedKw = kwData.value;
			const fetchedKva = kvaData.value;
			const fetchedKwh = kwhData.value;
			// Extract true cumulative dial readings, filtering out temporary '0' pings to prevent 
			// geometric artificial inflation during interpolation climbs.
			// Furthermore, peel off the +5.5h timezone ghosting created by the node-pg driver parsing naive IST inserts as UTC.
			const makeClean = (dRaw: any[]) => dRaw
				.filter((dp: any) => dp.reading > 0)
				.map((dp: any) => ({
					...dp,
					startTimestamp: dp.startTimestamp - (5.5 * 3600 * 1000)
				}));

			const cleanTodMeterData = makeClean(kwhData.raw);
			const cleanTodKvahData = makeClean(kvahData.raw);

			const { bucketMap, currentTariffCategory, currentContractDemand, currentDemandChargeRate, currentBilledDemand, energyRate, wheelingRate, facRate, electricityDutyPct, taxOnSaleRate } = calculateTOD(cleanTodMeterData, cleanTodKvahData, startDate, endDate, settings.rateHistory || [], settings.todRates);

			const buckets = TOD_ZONES.map(zone => {
				const data = bucketMap[zone.name];
				let dynamicTodRate = zone.rate;
				if (settings.todRates) {
					if (zone.name === 'Night') dynamicTodRate = settings.todRates.slot_2206;
					if (zone.name === 'Morning') dynamicTodRate = settings.todRates.slot_0609;
					if (zone.name === 'Peak Early') dynamicTodRate = settings.todRates.slot_0912;
					if (zone.name === 'Evening') dynamicTodRate = settings.todRates.slot_1218;
					if (zone.name === 'Peak Late') dynamicTodRate = settings.todRates.slot_1822;
				}
				return { ...zone, rate: dynamicTodRate, consumption: data.kwh, baseCharges: data.baseCharges, todCharges: data.todCharges, totalCharges: data.totalCharges, start: data.start, end: data.end };
			});

			const totalUnits = buckets.reduce((a, b) => a + b.consumption, 0);
			const totalBaseCharges = buckets.reduce((a, b) => a + b.baseCharges, 0);
			const netTOD = buckets.reduce((a, b) => a + b.todCharges, 0);

			// Constant defaults as per requirements but use DB if found
			const actualDemand = kvaData.value > 0 ? kvaData.value : 12;
			const billedDemand = currentBilledDemand;
			const powerFactor = fetchedKvah > 0 && fetchedKwh > 0 ? (fetchedKwh / fetchedKvah) : 0.996;
			const actualKwMd = kwData.value > 0 ? kwData.value : 0;

			// The unit baseline for all grand billing metrics follows KVAH for HT / primary formulas
			const billingUnits = fetchedKvah > 0 ? fetchedKvah : totalUnits;

			// --- STEP 1 & 2: Calculate all charges and Select ED-applicable ones ---
			// Included in ED Base: Energy, Wheeling, FAC, TOD adjustment, and single-rate Demand charges.
			const industrialCharges = billingUnits * energyRate;
			const totalWheeling = billingUnits * wheelingRate;
			const totalFAC = billingUnits * facRate;
			
			// Demand calculation for ED Base (excludes the 1.5x penalty surcharge portion)
			const primaryDemandCharge = billedDemand * currentDemandChargeRate;
			const taxableExcessDemand = actualDemand > currentContractDemand ? (actualDemand - currentContractDemand) * currentDemandChargeRate : 0;
			const totalTaxableDemand = primaryDemandCharge + taxableExcessDemand;

			// --- STEP 3: Add them → ED Base ---
			const edBase = industrialCharges + totalWheeling + totalFAC + netTOD + totalTaxableDemand;

			// --- STEP 4: Apply ED Rate (e.g., 7.5%) ---
			const totalElectricityDuty = edBase * (electricityDutyPct / 100);

			// --- STEP 5: Final Adjustments (Other charges, Tax on Sale, Penalty) ---
			const totalTaxOnSale = billingUnits * taxOnSaleRate;
			const powerFactorPenalty = 0;
			const excessDemandPenaltyPart = actualDemand > currentContractDemand ? (actualDemand - currentContractDemand) * (currentDemandChargeRate * 0.5) : 0; 
			const excessDemandCharges = taxableExcessDemand + excessDemandPenaltyPart; // Total MD charges (taxable + penalty)

			const rawGrandTotal = edBase + totalElectricityDuty + totalTaxOnSale + powerFactorPenalty + excessDemandPenaltyPart;
			
			// Final rounding as per standard rules (Round to nearest integer for display, final bill to nearest 10 if specified)
			const grandTotal = Math.round(rawGrandTotal);

			// Get overall readings for the strip
			const overallStart = kwhData.start || 0;
			const overallEnd = kwhData.end || 0;

			const offPeak = buckets.find(b => b.name === 'Night')!;
			const peak = buckets.find(b => b.name === 'Peak Late')!;
			const normals = buckets.filter(b => b.badge === 'Normal');
			const normalSurcharge = normals.reduce((a, b) => a + b.todCharges, 0);

			const start = new Date(startDate);
			const end = new Date(endDate);

			setReportData({
				targetName: adminPreferences.displayTitle || 'Absolute Motion Pvt. Ltd',
				address: settings.defaultAddress || 'R-601/1 Absolute Motion, Rabale.',
				activity: settings.defaultActivity || 'Energy Metering',
				meterName: meterName,
				period: `${start.toLocaleDateString('en-IN')} to ${end.toLocaleDateString('en-IN')}`,
				billMonth: start.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
				billDate: new Date().toLocaleDateString('en-IN'),
				dueDate: new Date(Date.now() + 20 * 86400000).toLocaleDateString('en-IN'),
				userEmail: (userProfile as any)?.email || 'admin@oed.com',
				mobileNo: (userProfile as any)?.mobileNo || '95******86',
				userName: userProfile?.username || 'ADMIN',
				units: totalUnits,
				overallStart,
				overallEnd,
				buckets,
				totalBaseCharges,
				industrialCharges,
				baseEnergyRate: energyRate,
				netTOD,
				grandTotal,
				offPeakUnits: offPeak.consumption,
				offPeakSavings: offPeak.todCharges,
				peakUnits: peak.consumption,
				peakSurcharge: peak.todCharges,
				normalSurcharge,
				currentTariffCategory,
				billedDemand,
				currentContractDemand,
				currentDemandChargeRate,
				powerFactor,
				actualKwMd,
				fetchedKvah,
				fetchedLag: lagData.value,
				fetchedLead: leadData.value,
				kvahData,
				lagData,
				leadData,
				demandCharges: primaryDemandCharge,
				excessDemandCharges,
				powerFactorPenalty,
				totalWheeling,
				totalFAC,
				totalTaxOnSale,
				totalElectricityDuty,
				taxableBase: edBase,
				electricityDutyPct,
				actualDemand,
				roundedPayable: Math.round(grandTotal / 10) * 10
			});
		} catch (e: any) {
			setError(e.message || 'Failed to generate report');
		} finally {
			setGenerating(false);
		}
	};

	const handleSaveReport = async () => {
		if (!reportData) return;
		setSaving(true);
		setSavedMsg('Generating PDF...');
		try {
			// Generate PDF on the fly
			const element = document.getElementById('bill-print-area');
			if (!element) throw new Error('Report element not found');

			const canvas = await html2canvas(element, { 
				scale: 2,
				useCORS: true,
				logging: false,
				backgroundColor: '#ffffff'
			});
			const imgData = canvas.toDataURL('image/png');
			const pdf = new jsPDF('p', 'mm', 'a4');
			const pdfWidth = pdf.internal.pageSize.getWidth();
			const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
			
			pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
			const pdfBase64 = pdf.output('datauristring');

			const payload = {
				billMonth: reportData.billMonth,
				periodStart: startDate,
				periodEnd: endDate,
				meterName: reportData.meterName,
				targetName: reportData.targetName,
				totalKvah: reportData.fetchedKvah || 0,
				totalKwh: reportData.units || 0,
				energyCharges: reportData.industrialCharges || 0,
				wheelingCharges: reportData.totalWheeling || 0,
				todEc: reportData.netTOD || 0,
				demandCharges: reportData.demandCharges || 0,
				fac: reportData.totalFAC || 0,
				electricityDuty: reportData.totalElectricityDuty || 0,
				taxOnSale: reportData.totalTaxOnSale || 0,
				excessDemand: reportData.excessDemandCharges || 0,
				grandTotal: reportData.grandTotal || 0,
				powerFactor: reportData.powerFactor || 0,
				billedDemand: reportData.billedDemand || 0,
				actualDemand: reportData.actualDemand || 0,
				fullReport: reportData,
				createdBy: reportData.userName,
				pdfData: pdfBase64
			};
			const res = await fetch('/api/saved-reports', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (res.ok) {
				setSavedMsg(`✅ Report saved at ${new Date().toLocaleTimeString('en-IN')}`);
			} else {
				const d = await res.json();
				throw new Error(d.error || 'Save failed');
			}
		} catch (e: any) {
			setSavedMsg(`❌ ${e.message}`);
		} finally {
			setSaving(false);
		}
	};

	const handleDownloadReport = async () => {
		if (!reportData) return;
		setSaving(true);
		setSavedMsg('Generating PDF for download...');
		try {
			const element = document.getElementById('bill-print-area');
			if (!element) throw new Error('Report element not found');

			const canvas = await html2canvas(element, { 
				scale: 2,
				useCORS: true,
				logging: false,
				backgroundColor: '#ffffff'
			});
			const imgData = canvas.toDataURL('image/png');
			const pdf = new jsPDF('p', 'mm', 'a4');
			const pdfWidth = pdf.internal.pageSize.getWidth();
			const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
			
			pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
			const fileName = `Bill_Report_${reportData.billMonth.replace(/\s+/g, '_')}_${reportData.meterName.replace(/[^a-z0-9]/gi, '_')}.pdf`;
			pdf.save(fileName);
			setSavedMsg(`✅ Report downloaded: ${fileName}`);
		} catch (e: any) {
			setSavedMsg(`❌ Download failed: ${e.message}`);
		} finally {
			setSaving(false);
		}
	};


	return (
		<div className="reports-page-container" style={{ padding: '24px', height: '100%', overflowY: 'auto', background: isDarkMode ? '#0d1117' : '#ffffff' }}>
			<style>{`
				.bill-page { max-width: 900px; margin: 0 auto; background: #fff; box-shadow: 0 8px 32px rgba(0,0,0,0.15); font-family: Arial, sans-serif; color: #000; font-size: 11px; }
				.header-bar { background: #0d2d5e; color: #fff; padding: 6px 12px; text-align: center; } /* Original Theme Color */
				.header-bar h2 { font-size: 15px; font-weight: bold; letter-spacing: 0.5px; margin: 0; }
				.doc-no { background: #0d2d5e; color: #fff; padding: 2px 8px; font-size: 10px; }
				.gstin-row, .admin-row { display: flex; justify-content: space-between; background: #0d2d5e; color: #fff; padding: 2px 8px; font-size: 10px; border-top: 1px solid #4466bb; }
				.admin-row span { font-weight: bold; }

				.consumer-section { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #000; border-top: none; }
				.consumer-left { border-right: 1px solid #000; padding: 4px 6px; }
				.consumer-right { padding: 4px 6px; }
				.info-row { display: flex; margin-bottom: 2px; font-size: 10.5px; }
				.info-label { color: #0d2d5e; font-weight: bold; min-width: 110px; font-size: 10px; }

				.tech-section { border: 1px solid #000; border-top: none; }
				.tech-row { display: grid; border-bottom: 1px solid #ccc; }
				.tech-row:last-child { border-bottom: none; }
				.tech-cell { padding: 2px 5px; border-right: 1px solid #ccc; font-size: 9.5px; }
				.tech-cell:last-child { border-right: none; }
				.tech-label { color: #0d2d5e; font-weight: bold; font-size: 9px; }

				.section-title { background: #0d2d5e; color: #fff; text-align: center; font-weight: bold; font-size: 12px; padding: 4px; border: 1px solid #000; border-top: none; }
				.data-table { width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #000; border-top: none; }
				.data-table th { background: #0d2d5e; color: #fff; padding: 4px 6px; text-align: center; border: 1px solid #4466bb; }
				.data-table td { padding: 3px 6px; border: 1px solid #ccc; text-align: right; }
				.data-table td:first-child { text-align: left; font-weight: bold; color: #0d2d5e; }
				.data-table tr:nth-child(even) { background: #e8f0ff; }

				.billing-details-section { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #000; border-top: none; }
				.bd-left { border-right: 1px solid #000; padding: 6px; }
				.bd-right { padding: 6px; }
				.bd-section-title { background: #0d2d5e; color: #fff; text-align: center; font-weight: bold; font-size: 12px; padding: 4px; margin: -6px -6px 6px -6px; }
				.bd-table { width: 100%; border-collapse: collapse; font-size: 10px; }
				.bd-table td { padding: 2px 4px; border: 1px solid #ccc; }
				.bd-table th { background: #164080; color: #fff; padding: 2px 4px; border: 1px solid #4466bb; font-size: 10px; }
				.bd-table .right { text-align: right; }

				.charges-table { width: 100%; border-collapse: collapse; font-size: 10px; }
				.charges-table td { padding: 2px 5px; border: 1px solid #ccc; }
				.charges-table .right { text-align: right; font-weight: bold; }
				.charges-table .highlight { background: #fffbe6; }

				.tod-table { width: 100%; border-collapse: collapse; font-size: 9.5px; margin-top: 4px; }
				.tod-table th { background: #164080; color: #fff; padding: 2px 4px; border: 1px solid #4466bb; }
				.tod-table td { padding: 2px 4px; border: 1px solid #ccc; text-align: right; }
				.tod-table td:first-child { text-align: left; }

				.amount-words { font-size: 9.5px; font-style: italic; color: #333; padding: 3px 5px; background: #fffbe6; border: 1px solid #e8a000; margin: 4px 0; }
				
				.bg-blue-row, .bg-blue-row td { background-color: #0d2d5e !important; color: #fff !important; }
				.bg-red-row, .bg-red-row td { background-color: #e30613 !important; color: #fff !important; }

				body.dark-mode .bill-page table th,
				body.dark-mode .bill-page table td {
					background-color: unset !important;
					color: #000 !important;
					border-color: #ccc !important;
				}
				body.dark-mode .bill-page .data-table tr:nth-child(even) td {
					background-color: #e8f0ff !important;
				}
				body.dark-mode .bill-page .charges-table .highlight td {
					background-color: #fffbe6 !important;
				}

				@media print { .no-print { display: none !important; } .bill-page { box-shadow: none !important; } }
			`}</style>

			<TooltipHelpComponent page='reports' />

			{/* Controls */}
			<div className="no-print mb-4" style={{
				background: isDarkMode ? '#161b22' : '#fff',
				padding: '20px',
				borderRadius: '12px',
				border: isDarkMode ? '1px solid #30363d' : '1px solid #E5E7EB',
				maxWidth: '800px',
				margin: '0 auto 24px'
			}}>
				<h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '20px', color: isDarkMode ? '#fff' : '#0d2d5e' }}>
					TOD Report Generator
				</h3>
				<div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
					<div style={{ flex: 1, minWidth: '160px' }}>
						<label style={{ fontSize: '11px', color: isDarkMode ? '#8b949e' : '#6B7280', display: 'block', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Main Meter (Configure in settings)</label>
						<input type="text" readOnly value={meterName} className="form-control" style={{ fontSize: '12px', background: isDarkMode ? '#0d1117' : '#f7f5f1' }} />
					</div>
					<div style={{ flex: 1, minWidth: '160px' }}>
						<label style={{ fontSize: '11px', color: isDarkMode ? '#8b949e' : '#6B7280', display: 'block', marginBottom: '4px' }}>KVAH Data Source</label>
						<select
							className="form-select"
							value={settings.reportKvahMeterId || ''}
							onChange={e => updateSettings({ reportKvahMeterId: e.target.value ? Number(e.target.value) : null })}
							style={{ fontSize: '12px', background: isDarkMode ? '#0d1117' : '#ffffff', color: isDarkMode ? '#e6edf3' : '#000', borderColor: isDarkMode ? '#30363d' : '#ccc' }}
						>
							<option value="">Auto-detect KVAH sibling</option>
							{allMeters?.slice().sort((a, b) => (a.identifier || '').localeCompare(b.identifier || '')).map(m => (
								<option key={m.id} value={m.id}>{m.identifier || m.name}</option>
							))}
						</select>
					</div>
					<div style={{ minWidth: '130px' }}>
						<label style={{ fontSize: '11px', color: isDarkMode ? '#8b949e' : '#6B7280', display: 'block', marginBottom: '4px' }}>From</label>
						<input type="date" className="form-control" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ fontSize: '12px' }} />
					</div>
					<div style={{ minWidth: '130px' }}>
						<label style={{ fontSize: '11px', color: isDarkMode ? '#8b949e' : '#6B7280', display: 'block', marginBottom: '4px' }}>To</label>
						<input type="date" className="form-control" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ fontSize: '12px' }} />
					</div>
					<div>
						<button className="btn btn-primary" onClick={handleGenerate} disabled={generating}
							style={{ padding: '8px 20px', fontWeight: '600', fontSize: '12px', whiteSpace: 'nowrap' }}>
							{generating ? 'Processing...' : 'Generate Bill Extract'}
						</button>
					</div>
				</div>
				{error && <div style={{ color: '#c0291c', marginTop: '12px', fontSize: '12px' }}>{error}</div>}
			</div>

			{/* Empty state */}
			{!reportData && !generating && (
				<div style={{ textAlign: 'center', padding: '80px 0', opacity: 0.5 }}>
					<span className="material-symbols-rounded" style={{ fontSize: '64px', color: isDarkMode ? '#fff' : '#0d2d5e' }}>receipt_long</span>
					<h4 style={{ color: isDarkMode ? '#fff' : '#0d2d5e', marginTop: '16px' }}>Ready to generate report</h4>
					<p style={{ color: isDarkMode ? '#8b949e' : '#6B7280' }}>Select a date range and click Generate.</p>
				</div>
			)}

			{/* Loading */}
			{generating && (
				<div style={{ textAlign: 'center', padding: '80px 0' }}>
					<div className="spinner-border text-primary" role="status"></div>
					<p style={{ marginTop: '20px', color: isDarkMode ? '#8b949e' : '#6B7280' }}>Fetching meter data &amp; calculating TOD charges...</p>
				</div>
			)}

			{/* Bill Report */}
			{reportData && (
				<div className="bill-page shadow-lg" id="bill-print-area">
					{/* Professional Header with Logo */}
					<div style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', border: '1px solid #000', borderBottom: 'none' }}>
						<img src="abs-logo.png" alt="Absolute Logo" style={{ height: '45px', objectFit: 'contain' }} />
						<div style={{ flex: 1, textAlign: 'center', paddingRight: '45px' }}>
							<h1 style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: '#0d2d5e', letterSpacing: '1px' }}>
								ABSOLUTE Motion Pvt. Ltd.
							</h1>
							<p style={{ margin: 0, fontSize: '10px', color: '#666', fontWeight: '600', textTransform: 'uppercase' }}>
								Industrial Energy Management Dashboard • Billing Extract
							</p>
						</div>
					</div>

					{/* Header */}
					<div className="header-bar"><h2>BILL OF SUPPLY FOR THE MONTH OF {reportData.billMonth.toUpperCase()}</h2></div>

					{/* Consumer Info + Bill Amounts */}
					<div className="consumer-section">
						<div className="consumer-left">
							{/* Removed Consumer No. as requested */}
							<div className="info-row"><span className="info-label">Consumer Name :</span><span>{reportData.targetName}</span></div>
							<div className="info-row"><span className="info-label">Address :</span><span>{reportData.address}</span></div>
						</div>
						<div className="consumer-right">
							<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
								<tbody>
									<tr>
										<td style={{ padding: '3px 6px', border: '1px solid #ccc', color: '#e30613', fontWeight: 'bold' }}>BILL DATE</td>
										<td style={{ padding: '3px 6px', border: '1px solid #ccc' }}>{reportData.billDate}</td>
										<td rowSpan={2} className="bg-blue-row" style={{ fontWeight: 'bold', fontSize: '16px', textAlign: 'center', padding: '6px 10px', border: '2px solid #0d2d5e', verticalAlign: 'middle' }}>
											{reportData.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
										</td>
									</tr>
									<tr>
										<td style={{ padding: '3px 6px', border: '1px solid #ccc', color: '#e30613', fontWeight: 'bold' }}>DUE DATE</td>
										<td style={{ padding: '3px 6px', border: '1px solid #ccc' }}>{reportData.dueDate}</td>
									</tr>
									<tr>
										<td style={{ padding: '3px 6px', border: '1px solid #ccc', color: '#008000', fontWeight: 'bold' }}>IF PAID UPTO</td>
										<td style={{ padding: '3px 6px', border: '1px solid #ccc' }}>{/* Usually some early payment date */} -- </td>
										<td style={{ padding: '3px 6px', border: '1px solid #ccc', color: '#008000', fontWeight: 'bold', textAlign: 'right' }}>
											{/* Early payment amount */} --
										</td>
									</tr>
									<tr>
										<td style={{ padding: '3px 6px', border: '1px solid #ccc', color: '#e30613', fontWeight: 'bold' }}>IF PAID AFTER</td>
										<td style={{ padding: '3px 6px', border: '1px solid #ccc' }}>{reportData.dueDate}</td>
										<td style={{ padding: '3px 6px', border: '1px solid #ccc', color: '#e30613', fontWeight: 'bold', textAlign: 'right' }}>
											{/* Late payment amount roughly */} --
										</td>
									</tr>
									<tr>
										<td style={{ padding: '3px 6px', border: '1px solid #ccc', fontWeight: 'bold' }}>Last Receipt No./Date</td>
										<td colSpan={2} style={{ padding: '3px 6px', border: '1px solid #ccc' }}>/--</td>
									</tr>
									<tr>
										<td style={{ padding: '3px 6px', border: '1px solid #ccc', fontWeight: 'bold' }}>Last Month Payment</td>
										<td colSpan={2} style={{ padding: '3px 6px', border: '1px solid #ccc' }}>00.00</td>
									</tr>
									<tr>
										<td style={{ padding: '3px 6px', border: '1px solid #ccc', fontWeight: 'bold' }}>Scale / Sector</td>
										<td colSpan={2} style={{ padding: '3px 6px', border: '1px solid #ccc' }}>Small Scale /Private Sector</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>

					{/* Technical Details */}
					<div className="tech-section">
						<div className="tech-row" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
							<div className="tech-cell"><div className="tech-label">Email ID :</div><div>{reportData.userEmail}</div></div>
							<div className="tech-cell"><div className="tech-label">Activity :</div><div>{reportData.activity}</div></div>
							<div className="tech-cell"><div className="tech-label">Meter Name :</div><div>{reportData.meterName}</div></div>
							<div className="tech-cell"><div className="tech-label">Seasonal :</div><div>N</div></div>
							<div className="tech-cell" style={{ gridColumn: 'span 2' }}><div className="tech-label">Load Shed Ind :</div></div>
						</div>
						<div className="tech-row" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
							<div className="tech-cell"><div className="tech-label">Mobile No. :</div><div>{reportData.mobileNo}</div></div>
							<div className="tech-cell"><div className="tech-label">Tariff :</div><div>{reportData.currentTariffCategory}</div></div>
							<div className="tech-cell"><div className="tech-label">Connected Load (KW):</div><div>--</div></div>
							<div className="tech-cell"><div className="tech-label">Urban/Rural Flag :</div><div>--</div></div>
							<div className="tech-cell"><div className="tech-label">Express Feeder Flag :</div><div>N</div></div>
							<div className="tech-cell"></div>
						</div>
						<div className="tech-row" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
							<div className="tech-cell"><div className="tech-label">Contract Demand (KVA) :</div><div>{reportData.currentContractDemand}</div></div>
							<div className="tech-cell"><div className="tech-label">40% of Con. Demand(KVA) :</div><div>{reportData.currentContractDemand * 0.4}</div></div>
							<div className="tech-cell"><div className="tech-label">Feeder Voltage (KV) :</div><div>--</div></div>
							<div className="tech-cell"><div className="tech-label">LIS Indicator :</div></div>
							<div className="tech-cell" style={{ gridColumn: 'span 2' }}></div>
						</div>
						<div className="tech-row" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
							<div className="tech-cell"><div className="tech-label">Sanctioned load (KW) :</div><div>--</div></div>
							<div className="tech-cell" style={{ gridColumn: 'span 5' }}></div>
						</div>
						<div className="tech-row" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
							<div className="tech-cell"><div className="tech-label">DTC :</div><div>--</div></div>
							<div className="tech-cell"><div className="tech-label">PC-MR-ROUTE-SEQ :</div><div>--</div></div>
							<div className="tech-cell"><div className="tech-label">BU :</div><div>--</div></div>
							<div className="tech-cell"><div className="tech-label">PC :</div><div>--</div></div>
							<div className="tech-cell" style={{ gridColumn: 'span 2' }}></div>
						</div>
						<div className="tech-row" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
							<div className="tech-cell"><div className="tech-label">Date of Connection :</div><div>--</div></div>
							<div className="tech-cell"><div className="tech-label">Category :</div><div>LT Industry General</div></div>
							<div className="tech-cell"><div className="tech-label">GSTIN :</div></div>
							<div className="tech-cell" style={{ gridColumn: 'span 3' }}></div>
						</div>
						<div className="tech-row" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
							<div className="tech-cell"><div className="tech-label">Supply at :</div><div>LT</div></div>
							<div className="tech-cell"><div className="tech-label">Elec. Duty :</div><div>--</div></div>
							<div className="tech-cell"><div className="tech-label">PAN :</div></div>
							<div className="tech-cell" style={{ gridColumn: 'span 3' }}></div>
						</div>
						<div className="tech-row" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
							<div className="tech-cell"><div className="tech-label">Prev. Highest (Mth) :</div></div>
							<div className="tech-cell"><div className="tech-label">Prev. Highest Demand (KVA) :</div></div>
							<div className="tech-cell" style={{ gridColumn: 'span 4' }}></div>
						</div>
						<div className="tech-row" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
							<div className="tech-cell"><div className="tech-label">Security Deposit Rs. :</div><div>--</div></div>
							<div className="tech-cell"><div className="tech-label">Addl. S.D.Demanded Rs :</div><div>00.00</div></div>
							<div className="tech-cell" style={{ gridColumn: 'span 4' }}></div>
						</div>
						<div className="tech-row" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
							<div className="tech-cell"><div className="tech-label">Bank Guarantee Rs. :</div><div>0.00</div></div>
							<div className="tech-cell"><div className="tech-label">S.D. Arrears Rs. :</div><div>--</div></div>
							<div className="tech-cell" style={{ gridColumn: 'span 4' }}></div>
						</div>
					</div>

					{/* Current Consumption Details */}
					<div className="section-title">CURRENT CONSUMPTION DETAILS</div>
					<table className="data-table">
						<thead>
							<tr>
								<th>Reading Date</th>
								<th>KWH</th>
								<th>KVAH</th>
								<th>RKVAH(LAG)</th>
								<th>RKVAH(LEAD)</th>
								<th>KW(MD)</th>
								<th>KVA(MD)</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>Current {reportData.period.split(' to ')[1]}</td>
								<td>{reportData.overallEnd.toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td>
								<td>{reportData.kvahData?.end > 0 ? reportData.kvahData.end.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '--'}</td>
								<td>{reportData.lagData?.end > 0 ? reportData.lagData.end.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '--'}</td>
								<td>{reportData.leadData?.end > 0 ? reportData.leadData.end.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '--'}</td>
								<td style={{ textAlign: 'center' }}>
									{reportData.actualKwMd > 0 ? reportData.actualKwMd.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '0.000'}
								</td>
								<td rowSpan={8} style={{ verticalAlign: 'middle', textAlign: 'center', background: '#fff' }}>
									{reportData.actualDemand.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
								</td>
							</tr>
							<tr>
								<td>Previous {reportData.period.split(' to ')[0]}</td>
								<td>{reportData.overallStart.toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td>
								<td>{reportData.kvahData?.start > 0 ? reportData.kvahData.start.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '--'}</td>
								<td>{reportData.lagData?.start > 0 ? reportData.lagData.start.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '--'}</td>
								<td>{reportData.leadData?.start > 0 ? reportData.leadData.start.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '--'}</td>
								<td style={{ textAlign: 'center' }}>0.000</td>
							</tr>
							<tr>
								<td>Difference</td>
								<td>{(reportData.overallEnd - reportData.overallStart).toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td>
								<td>{reportData.fetchedKvah > 0 ? reportData.fetchedKvah.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '0.000'}</td>
								<td>{reportData.fetchedLag > 0 ? reportData.fetchedLag.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '0.000'}</td>
								<td>{reportData.fetchedLead > 0 ? reportData.fetchedLead.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '0.000'}</td>
								<td style={{ textAlign: 'center' }}>0.000</td>
							</tr>
							<tr>
								<td>Multiplying Factor</td>
								<td>1.000</td>
								<td>1.000</td>
								<td>1.000</td>
								<td>1.000</td>
								<td style={{ textAlign: 'center' }}>1.000</td>
							</tr>
							<tr>
								<td>Consumption</td>
								<td>{((reportData.overallEnd - reportData.overallStart) * 1).toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td>
								<td>{reportData.fetchedKvah > 0 ? reportData.fetchedKvah.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '0.000'}</td>
								<td>{reportData.fetchedLag > 0 ? reportData.fetchedLag.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '0.000'}</td>
								<td>{reportData.fetchedLead > 0 ? reportData.fetchedLead.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '0.000'}</td>
								<td style={{ textAlign: 'center' }}>0.000</td>
							</tr>
							<tr>
								<td>LT Metering</td>
								<td>0.000</td>
								<td>0.000</td>
								<td>0.000</td>
								<td>0.000</td>
								<td style={{ textAlign: 'center' }}>0.000</td>
							</tr>
							<tr>
								<td>Adjustment</td>
								<td>0.000</td>
								<td>0.000</td>
								<td>0.000</td>
								<td>0.000</td>
								<td style={{ textAlign: 'center' }}>0.000</td>
							</tr>
							<tr>
								<td>Assessed Consump</td>
								<td>0.000</td>
								<td>0.000</td>
								<td>0.000</td>
								<td>0.000</td>
								<td style={{ textAlign: 'center' }}>0.000</td>
							</tr>
							<tr className="bg-blue-row" style={{ fontWeight: 'bold' }}>
								<td>Total Consumption</td>
								<td>{((reportData.overallEnd - reportData.overallStart) * 1).toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td>
								<td>{reportData.fetchedKvah > 0 ? reportData.fetchedKvah.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '0.000'}</td>
								<td>{reportData.fetchedLag > 0 ? reportData.fetchedLag.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '0.000'}</td>
								<td>{reportData.fetchedLead > 0 ? reportData.fetchedLead.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '0.000'}</td>
								<td style={{ textAlign: 'center' }}>{reportData.actualKwMd > 0 ? reportData.actualKwMd.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '0.000'}</td>
								<td style={{ textAlign: 'center' }}>{reportData.actualDemand.toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td>
							</tr>
						</tbody>
					</table>

					{/* Billing Details */}
					<div className="billing-details-section">
						<div className="bd-left">
							<div className="bd-section-title">BILLING DETAILS</div>
							<table className="bd-table" style={{ marginBottom: '4px' }}>
								<tbody>
									<tr><td>Billed Demand (KVA)</td><td className="right">{reportData.billedDemand.toFixed(2)}</td><td>@ Rs.</td><td className="right">{reportData.currentDemandChargeRate.toFixed(2)}</td></tr>
									<tr><td>Assessed P.F.</td><td></td><td>Avg. P.F.</td><td className="right">{reportData.powerFactor.toFixed(3)}</td></tr>
									<tr><td>Billed P.F.</td><td className="right">{reportData.powerFactor.toFixed(3)}</td><td>L.F.</td><td></td></tr>
								</tbody>
							</table>
							<table className="bd-table" style={{ marginBottom: '4px' }}>
								<thead><tr><th>Consumption Type</th><th>Units</th><th>Rate</th><th>Charges Rs.</th></tr></thead>
								<tbody>
									<tr><td>Industrial</td><td className="right">{reportData.fetchedKvah > 0 ? reportData.fetchedKvah.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : reportData.units.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td><td className="right">{reportData.baseEnergyRate.toFixed(2)}</td><td className="right">{reportData.industrialCharges.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
									<tr><td>Residential</td><td className="right">0</td><td className="right">0.00</td><td className="right">0.00</td></tr>
									<tr><td>Commercial</td><td className="right">0</td><td className="right">0.00</td><td className="right">0.00</td></tr>
								</tbody>
							</table>
							<table className="bd-table" style={{ marginBottom: '4px' }}>
								<thead><tr><th>E.D. on(Rs)</th><th>Rate %</th><th colSpan={2}>Amount Rs.</th></tr></thead>
								<tbody>
									<tr><td className="right">{reportData.taxableBase.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td className="right">{reportData.electricityDutyPct}%</td><td colSpan={2} className="right">{reportData.totalElectricityDuty.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
									<tr><td className="right">0.00</td><td className="right">0</td><td colSpan={2} className="right">0.00</td></tr>
									<tr><td className="right">0.00</td><td className="right">0</td><td colSpan={2} className="right">0.00</td></tr>
								</tbody>
							</table>
							<table className="tod-table">
								<thead><tr><th>TOD Zone</th><th>Rate</th><th>Units</th><th>Cost Rs.</th><th>Charges Rs.</th></tr></thead>
								<tbody>
									{reportData.buckets.map((b: any, i: number) => (
										<tr key={i}>
											<td>{b.time}</td>
											<td>{b.rate}</td>
											<td>{b.consumption.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
											<td>{b.baseCharges.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
											<td>{b.todCharges.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
										</tr>
									))}
								</tbody>
							</table>
							<div className="amount-words" style={{ marginTop: '6px' }}>
								Amount<br />
								<strong>₹ {reportData.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
							</div>
						</div>

						<div className="bd-right">
							<div className="bd-section-title">&nbsp;</div>
							<table className="charges-table">
								<tbody>
									<tr><td>Demand Charges</td><td className="right">{reportData.demandCharges.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
									<tr><td>Wheeling Charge</td><td className="right">{reportData.totalWheeling.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
									<tr><td>Energy Charges</td><td className="right">{reportData.industrialCharges.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
									<tr><td>TOD Tariff EC</td><td className="right">{reportData.netTOD.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
									<tr><td>FAC</td><td className="right">{reportData.totalFAC.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
									<tr><td>Electricity Duty</td><td className="right">{reportData.totalElectricityDuty.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
									<tr><td>Other charges</td><td className="right">0.00</td></tr>
									<tr><td>Tax on Sale</td><td className="right">{reportData.totalTaxOnSale.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
									<tr><td>P.F. Penal Charges/P.F. Inc.</td><td className="right">{reportData.powerFactorPenalty.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
									<tr><td>Charges For Excess Demand</td><td className="right">{reportData.excessDemandCharges.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
									<tr><td>Debit Bill Adjustment</td><td className="right">0.00</td></tr>
									<tr className="bg-blue-row">
										<td style={{ fontWeight: 'bold' }}>TOTAL CURRENT BILL</td>
										<td className="right" style={{ fontWeight: 'bold' }}>
											{reportData.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
										</td>
									</tr>
									<tr><td>Current Interest</td><td className="right">0.00</td></tr>
									<tr><td>Principle Arrears</td><td className="right">0.00</td></tr>
									<tr><td>Interest Arrears</td><td className="right">0.00</td></tr>
									<tr className="bg-red-row">
										<td style={{ fontWeight: 'bold', fontSize: '12px' }}>Total Bill (Rounded) Rs.</td>
										<td className="right" style={{ fontWeight: 'bold', fontSize: '12px' }}>
											{reportData.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
										</td>
									</tr>
									<tr className="highlight"><td>Delayed Payment Charges Rs.</td><td className="right">0.00</td></tr>
									<tr className="bg-blue-row">
										<td style={{ fontSize: '9px' }}>Amount Payable {reportData.dueDate} After<br />Amount Rounded to Nearest Rs.(10/-)</td>
										<td className="right" style={{ fontWeight: 'bold', fontSize: '13px' }}>
											₹ {reportData.roundedPayable?.toLocaleString('en-IN') || reportData.grandTotal.toLocaleString('en-IN')}
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>

					<div className="no-print mt-4 pb-4 px-4" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
						<div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
							<button 
								className="btn btn-dark" 
								onClick={handleDownloadReport} 
								disabled={saving}
								style={{ minWidth: '180px' }}
							>
								<span className="material-symbols-rounded align-middle me-2">{(saving && savedMsg.includes('download')) ? 'hourglass_top' : 'download'}</span>
								{(saving && savedMsg.includes('download')) ? 'Generating...' : 'Download PDF'}
							</button>
							<button
								className="btn btn-success"
								onClick={handleSaveReport}
								disabled={saving}
								style={{ minWidth: '180px' }}
							>
								<span className="material-symbols-rounded align-middle me-2">{(saving && !savedMsg.includes('download')) ? 'hourglass_top' : 'save'}</span>
								{(saving && !savedMsg.includes('download')) ? 'Saving...' : 'Save Report'}
							</button>
						</div>
						{savedMsg && (
							<div style={{ fontSize: '13px', color: savedMsg.startsWith('✅') ? '#22c55e' : '#ef4444', fontWeight: 500 }}>
								{savedMsg}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}