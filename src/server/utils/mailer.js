/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const nodemailer = require('nodemailer');
const config = require('../config');
const { log } = require('../log');

/**
 * Send an email using the configured mailer.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - Email body (HTML)
 * @returns {Promise<void>}
 */
async function sendEmail(to, subject, html) {
	if (config.mailer.method === 'none') {
		log.info(`[MAILER] Dry-run: Email to ${to} not sent (method is 'none'). Subject: ${subject}`);
		return;
	}

	let transporter;
	if (config.mailer.method === 'secure-smtp') {
		transporter = nodemailer.createTransport({
			host: config.mailer.smtp,
			port: config.mailer.port,
			secure: true,
			auth: {
				user: config.mailer.ident,
				pass: config.mailer.credential
			}
		});
	} else {
		log.error(`[MAILER] Unable to send email: unknown mailer method ${config.mailer.method}`);
		return;
	}

	const mailOptions = {
		from: config.mailer.from,
		to: to,
		subject: subject,
		html: html
	};

	try {
		await transporter.sendMail(mailOptions);
		log.info(`[MAILER] Email sent to ${to}: ${subject}`);
	} catch (err) {
		log.error(`[MAILER] Failed to send email to ${to}: ${err.message}`, err);
		throw err;
	}
}

module.exports = { sendEmail };
