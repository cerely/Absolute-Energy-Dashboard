import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Spinner } from 'reactstrap';
import { useAppSelector } from '../../../redux/reduxHooks';
import { selectTheme } from '../../../redux/slices/appStateSlice';
import { toast } from 'react-toastify';

interface SavedReport {
	id: number;
	saved_at: string;
	bill_month: string;
	period_start: string;
	period_end: string;
	meter_name: string;
	target_name: string;
	total_kvah: number;
	total_kwh: number;
	energy_charges: number;
	wheeling_charges: number;
	tod_ec: number;
	demand_charges: number;
	fac: number;
	electricity_duty: number;
	tax_on_sale: number;
	excess_demand: number;
	grand_total: number;
	power_factor: number;
	billed_demand: number;
	actual_demand: number;
	created_by?: string;
}

function fmt(n: number | null | undefined, digits = 2) {
	if (n == null || isNaN(Number(n))) return '—';
	return Number(n).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export default function ReportLogPage() {
	const theme = useAppSelector(selectTheme);
	const isDark = theme === 'dark';
	const [reports, setReports] = useState<SavedReport[]>([]);
	const [loading, setLoading] = useState(true);
	const [deleting, setDeleting] = useState<number | null>(null);
	const [downloading, setDownloading] = useState<number | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch('/api/saved-reports');
			if (res.ok) setReports(await res.json());
			else throw new Error('Failed to load');
		} catch {
			toast.error('Could not load saved reports.');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => { load(); }, [load]);

	const handleDelete = async (id: number) => {
		if (!window.confirm('Delete this saved report?')) return;
		setDeleting(id);
		try {
			const res = await fetch(`/api/saved-reports/${id}`, { method: 'DELETE' });
			if (res.ok) {
				toast.success('Report deleted.');
				setReports(prev => prev.filter(r => r.id !== id));
			} else throw new Error();
		} catch {
			toast.error('Failed to delete report.');
		} finally {
			setDeleting(null);
		}
	};

	const handleDownload = async (id: number) => {
		setDownloading(id);
		try {
			const res = await fetch(`/api/saved-reports/${id}/pdf`);
			if (!res.ok) throw new Error('PDF not found');
			const { pdfData, billMonth } = await res.json();
			if (!pdfData) throw new Error('No PDF data available for this report.');

			const link = document.createElement('a');
			link.href = pdfData;
			link.download = `Bill_Report_${billMonth || 'Archive'}_${id}.pdf`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		} catch (e: any) {
			toast.error(e.message || 'Failed to download PDF');
		} finally {
			setDownloading(null);
		}
	};

	const bg = isDark ? '#0d1117' : '#f6f8fa';
	const cardBg = isDark ? '#161b22' : '#ffffff';
	const textPrimary = isDark ? '#e6edf3' : '#1a1a2e';
	const textSub = isDark ? '#8b949e' : '#6b7280';
	const border = isDark ? '#30363d' : '#e0e0e0';
	const headerBg = isDark ? '#0d2d5e' : '#0d2d5e';

	return (
		<div style={{ padding: '24px', minHeight: '100%', background: bg, color: textPrimary }}>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
				<div>
				</div>
				<button
					onClick={load}
					style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: cardBg, border: `1px solid ${border}`, borderRadius: '8px', color: textPrimary, cursor: 'pointer', fontSize: '13px' }}
				>
					<span className="material-symbols-rounded" style={{ fontSize: '18px' }}>refresh</span>
					Refresh
				</button>
			</div>

			{loading ? (
				<div style={{ textAlign: 'center', padding: '60px' }}><Spinner color="primary" /></div>
			) : reports.length === 0 ? (
				<div style={{ textAlign: 'center', padding: '60px', color: textSub, background: cardBg, borderRadius: '12px', border: `1px solid ${border}` }}>
					<span className="material-symbols-rounded" style={{ fontSize: '48px', display: 'block', marginBottom: '12px', opacity: 0.4 }}>inbox</span>
					No saved reports yet. Generate a report and click "Save Report" to log it here.
				</div>
			) : (
				<div style={{ background: cardBg, borderRadius: '12px', border: `1px solid ${border}`, overflow: 'hidden', boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.08)' }}>
					<div style={{ overflowX: 'auto' }}>
						<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '1100px' }}>
							<thead>
								<tr style={{ background: headerBg, color: '#fff' }}>
									<th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Log Info</th>
									<th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Bill Month</th>
									<th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Period</th>
									<th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Consumer</th>
									<th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Meter</th>
									<th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>kVAh</th>
									<th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>kWh</th>
									<th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>Grand Total (₹)</th>
									<th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>PDF</th>
									<th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>Action</th>
								</tr>
							</thead>
							<tbody>
								{reports.map((r, i) => {
									const savedAt = new Date(r.saved_at);
									const rowBg = i % 2 === 0 ? cardBg : (isDark ? '#1a2332' : '#f8faff');
									return (
										<tr key={r.id} style={{ background: rowBg, borderBottom: `1px solid ${border}` }}>
											<td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
												<div style={{ fontWeight: 600, fontSize: '11px' }}>{savedAt.toLocaleDateString('en-IN')} | {savedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
												<div style={{ color: '#0d2d5e', fontSize: '10px', fontWeight: 700 }}>BY: {r.created_by || 'ADMIN'}</div>
											</td>
											<td style={{ padding: '9px 12px', fontWeight: 600 }}>{r.bill_month || '—'}</td>
											<td style={{ padding: '9px 12px', color: textSub, whiteSpace: 'nowrap' }}>{r.period_start} → {r.period_end}</td>
											<td style={{ padding: '9px 12px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.target_name || '—'}</td>
											<td style={{ padding: '9px 12px', color: textSub, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.meter_name || '—'}</td>
											<td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(r.total_kvah, 1)}</td>
											<td style={{ padding: '9px 12px', textAlign: 'right' }}>{fmt(r.total_kwh, 1)}</td>
											<td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#0d2d5e' }}>
												{fmt(r.grand_total)}
											</td>
											<td style={{ padding: '9px 12px', textAlign: 'center' }}>
												<button
													onClick={() => handleDownload(r.id)}
													disabled={downloading === r.id}
													style={{ background: '#0d2d5e', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', padding: '4px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
												>
													{downloading === r.id ? <Spinner size="sm" /> : <><span className="material-symbols-rounded" style={{ fontSize: '14px' }}>download</span> PDF</>}
												</button>
											</td>
											<td style={{ padding: '9px 12px', textAlign: 'center' }}>
												<button
													onClick={() => handleDelete(r.id)}
													disabled={deleting === r.id}
													title="Delete this report"
													style={{ background: 'transparent', border: `1px solid #ef4444`, borderRadius: '6px', color: '#ef4444', cursor: 'pointer', padding: '4px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
												>
													{deleting === r.id
														? <Spinner size="sm" />
														: <><span className="material-symbols-rounded" style={{ fontSize: '14px' }}>delete</span></>
													}
												</button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
					<div style={{ padding: '10px 14px', borderTop: `1px solid ${border}`, color: textSub, fontSize: '12px' }}>
						{reports.length} saved report{reports.length !== 1 ? 's' : ''}
					</div>
				</div>
			)}
		</div>
	);
}
