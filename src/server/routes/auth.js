/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const secretToken = require('../config').secretToken;
const validate = require('jsonschema').validate;
const { log } = require('../log');
const { getConnection } = require('../db');
const { credentialsRequestValidationMiddleware } = require('./authenticator');

const router = express.Router();

/**
 * Sign up a new user.
 */
router.post('/signup', async (req, res) => {
	const validParams = {
		type: 'object',
		required: ['username', 'password', 'email'],
		properties: {
			username: { type: 'string', minLength: 3, maxLength: 254 },
			password: { type: 'string', minLength: 8, maxLength: 128 },
			email: { type: 'string', format: 'email' }
		}
	};

	if (!validate(req.body, validParams).valid) {
		return res.status(400).json({ message: 'Invalid registration details. Username must be 3+ chars, password 8+ chars.' });
	}

	const { username, password, email } = req.body;
	const conn = getConnection();

	try {
		// Check if user exists
		const existingUser = await User.getByUsername(username, conn);
		if (existingUser) {
			return res.status(400).json({ message: 'User already exists.' });
		}

		const hashedPassword = await bcrypt.hash(password, 10);
		
		// Default role 'export'
		const user = new User(undefined, username, hashedPassword, 'export', 'Self-registered user', '', email, '');
		await user.insert(conn);

		// Automatically log in after signup
		const newUser = await User.getByUsername(username, conn);
		const token = jwt.sign({ data: newUser.id }, secretToken, { expiresIn: 86400 });
		
		res.json({ 
			token: token, 
			username: newUser.username, 
			role: newUser.role,
			message: 'Registration successful'
		});
	} catch (err) {
		log.error(`Registration error for ${username}: ${err.message}`, err);
		res.status(500).json({ message: 'Internal Server Error' });
	}
});

/**
 * Login existing user.
 */
router.post('/login', credentialsRequestValidationMiddleware, async (req, res) => {
	const validParams = {
		type: 'object',
		required: ['username', 'password'],
		properties: {
			username: { type: 'string' },
			password: { type: 'string' }
		}
	};

	if (!validate(req.body, validParams).valid) {
		return res.sendStatus(400);
	}

	const conn = getConnection();
	try {
		const user = await User.getByUsername(req.body.username, conn);
		if (!user) {
			return res.status(401).json({ message: 'Invalid credentials' });
		}

		const isValid = await bcrypt.compare(req.body.password, user.passwordHash);
		if (isValid) {
			const token = jwt.sign({ data: user.id }, secretToken, { expiresIn: 86400 });
			res.json({ token: token, username: user.username, role: user.role });
		} else {
			res.status(401).json({ message: 'Invalid credentials' });
		}
	} catch (err) {
		log.error(`Login error for ${req.body.username}: ${err.message}`, err);
		res.status(500).json({ message: 'Internal Server Error' });
	}
});

module.exports = router;
