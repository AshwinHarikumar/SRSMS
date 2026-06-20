import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db';
// In a real app we'd use bcrypt
// import bcrypt from 'bcrypt'; 

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_srsms';

export const login = async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    try {
        const result = await query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        
        // For demonstration, plain comparison. Replace with bcrypt.compare
        if (password !== user.password_hash) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Get roles
        const rolesResult = await query(`
            SELECT r.name FROM roles r
            JOIN user_roles ur ON r.id = ur.role_id
            WHERE ur.user_id = $1
        `, [user.id]);

        const roles = rolesResult.rows.map((row) => row.name);

        const token = jwt.sign(
            { id: user.id, email: user.email, roles },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ token, user: { id: user.id, email: user.email, roles } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
