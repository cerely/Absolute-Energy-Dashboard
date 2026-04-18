const nodemailer = require('nodemailer');
const config = require('../config');
const { getConnection } = require('../db');
const { log } = require('../log');

/**
 * sendMonthlyBill
 * Called by the cron scheduler on the 1st of every month or manually from the UI.
 * If reportId is provided, it fetches and mails that specific saved report PDF.
 * Otherwise, it calculates the previous month's bill extract on the fly (Automated).
 */

// Reusable SMTP transporter (created once, reused across sends to avoid
// repeated TLS handshakes which are the main source of latency).
let _transporter = null;
function getTransporter() {
	if (_transporter) return _transporter;
	if (!config.mailer || config.mailer.method === 'none' || !config.mailer.method) return null;
	if (config.mailer.method !== 'secure-smtp') return null;

	_transporter = nodemailer.createTransport({
		host: config.mailer.smtp,
		port: config.mailer.port,
		secure: true,
		pool: true,          // keep the connection alive for reuse
		maxConnections: 3,
		auth: {
			user: config.mailer.ident,
			pass: config.mailer.credential
		}
	});
	return _transporter;
}

async function sendMonthlyBill(reportId = null) {
	const transporter = getTransporter();
	if (!transporter) {
		log.info('[BillMailer] Mailer not configured — skipping monthly bill email.');
		return;
	}

	try {
		const db = getConnection();
		
		// 1. Fetch dashboard settings for the recipient email
		const settingsRow = await db.oneOrNone(
			"SELECT value FROM global_settings WHERE key = 'dashboard_settings'"
		);
		let settings = {};
		if (settingsRow && settingsRow.value) {
			try { 
				settings = typeof settingsRow.value === 'string' ? JSON.parse(settingsRow.value) : settingsRow.value; 
			} catch (e) { /* ignore */ }
		}
		
		const recipientEmail = settings.reportRecipientEmail || config.mailer.to;
		if (!recipientEmail) {
			log.error('[BillMailer] No recipient email configured in settings or environment.');
			return;
		}

		let subject = '';
		let htmlBody = '';
		let attachments = [];
		const org = config.mailer.org || 'Industry';

		// Case 1: Manual dispatch of a specific saved report (from Report Log)
		if (reportId !== null && reportId !== undefined && reportId !== '') {
			const id = Number(reportId);
			log.info(`[BillMailer] Fetching saved report ID: ${id} for manual dispatch...`);
			
			const report = await db.oneOrNone('SELECT * FROM saved_reports WHERE id = $1', [id]);
			if (!report) {
				log.error(`[BillMailer] Report with ID ${id} not found.`);
				return;
			}

			const monthName = report.bill_month || 'Archive';
			subject = `Energy Report: ${report.target_name || org} - ${monthName}`;
			
			// Simple HTML body for manual reports (just "find attached")
			htmlBody = `
				<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
					<div style="background:#0d2d5e;padding:24px;text-align:center;">
						<h2 style="color:#ffffff;margin:0;">📁 Energy Report Attached</h2>
					</div>
					<div style="padding:32px;background:#ffffff;text-align:center;">
						<p style="font-size:16px;color:#1e293b;margin:0 0 16px;">Hello,</p>
						<p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 24px;">
							The energy report for <strong>${monthName}</strong> has been generated and is attached to this email as a PDF.
						</p>
						<div style="display:inline-block;padding:12px 24px;background:#f1f5f9;border-radius:8px;color:#0d2d5e;font-weight:600;font-size:14px;">
							${report.target_name || 'Consumer'} • ${report.meter_name || 'Main Meter'}
						</div>
					</div>
					<div style="padding:16px;background:#f8fafc;text-align:center;font-size:12px;color:#94a3b8;border-top:1px solid #e5e7eb;">
						Sent via ${org} Energy Dashboard
					</div>
				</div>
			`;

			if (report.pdf_data && report.pdf_data.includes('base64,')) {
				const base64Content = report.pdf_data.split('base64,').pop();
				attachments.push({
					filename: `Energy_Report_${monthName.replace(/\s+/g, '_')}_${id}.pdf`,
					content: Buffer.from(base64Content, 'base64'),
					contentType: 'application/pdf'
				});
				log.info(`[BillMailer] Attached PDF from saved_reports (ID: ${id})`);
			} else {
				log.warn(`[BillMailer] No valid PDF data found for report ${id}. Sending email without attachment.`);
			}

		} else {
			// Case 2: Automated Monthly Dispatch (calculated on the fly)
			log.info('[BillMailer] Generating automated monthly bill extracts...');
			
			const lastMonth = new Date();
			lastMonth.setDate(0); // Go to last day of previous month
			const monthName = lastMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

			// Calculate stats for the automated summary table
			const stats = await db.oneOrNone(`
				SELECT 
					SUM(r.reading) as total_units
				FROM readings r 
				JOIN meters m ON r.meter_id = m.id 
				WHERE r.start_timestamp >= date_trunc('month', current_date - interval '1 month')
				  AND r.start_timestamp < date_trunc('month', current_date)
                  AND m.enabled = true
			`);

			const grandTotal = (stats?.total_units || 0) * 7.76;

			subject = `Monthly Electricity Summary - ${monthName}`;
			htmlBody = `
				<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
					<div style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);padding:28px 32px;">
						<h2 style="color:#ffffff;margin:0;font-size:22px;">⚡ Monthly Electricity Bill</h2>
						<p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">Summary for ${monthName}</p>
					</div>
					<div style="padding:28px 32px;background:#f8fafc;">
						<table style="width:100%;border-collapse:collapse;font-size:14px;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
							<tr><td style="padding:12px;border-bottom:1px solid #eee;">Total Consumption</td><td style="padding:12px;text-align:right;border-bottom:1px solid #eee;">${(stats?.total_units || 0).toLocaleString()} kWh</td></tr>
							<tr style="background:#1e293b;"><td style="padding:12px;color:#fff;font-weight:bold;">Estimated Total</td><td style="padding:12px;color:#10b981;text-align:right;font-weight:bold;font-size:18px;">₹${grandTotal.toLocaleString('en-IN')}</td></tr>
						</table>
					</div>
					<div style="padding:16px;text-align:center;font-size:12px;color:#64748b;">
						This is an automated summary. For the full itemized report, please visit the dashboard.
					</div>
				</div>
			`;
		}

		// 3. Dispatch Email
		const mailOptions = {
			from: `"Energy Dashboard" <${config.mailer.from}>`,
			to: recipientEmail,
			subject: subject,
			html: htmlBody,
			attachments: attachments
		};

		const info = await transporter.sendMail(mailOptions);
		log.info(`[BillMailer] Energy report sent to ${recipientEmail} successfully (ReportID: ${reportId || 'AUTO'}) — ${info.response}`);

	} catch (error) {
		log.error(`[BillMailer] Failed to send monthly bill: ${error.message}`);
		throw error;
	}
}

module.exports = { sendMonthlyBill };
