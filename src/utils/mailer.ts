// This file sends all emails that FreshRoute needs to send to users.
// It uses Gmail (via nodemailer) to send password resets, approvals, rejections, and security alerts.

import nodemailer from "nodemailer";

// Set up the Gmail connection using email and password from the .env file
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
} as any);

// When the server starts, test the email connection and log if it works or fails
transporter.verify((error) => {
  if (error) {
    console.error("❌ Email transporter failed:", error);
  } else {
    console.log("✅ Email transporter ready");
  }
});

// The "from" name and address shown in every email
const FROM = `"FreshRoute" <${process.env.EMAIL_USER}>`;

// The frontend URL used to build links inside emails (e.g. reset link, sign-in link)
const APP_URL = process.env.CLIENT_URL ?? "http://localhost:5173";

// Send a password reset email with a button that links to the reset page
export const sendResetEmail = async (
  email: string,
  resetUrl: string
): Promise<void> => {
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: "Reset your FreshRoute password",
    html: `
      <!DOCTYPE html><html lang="en">
      <head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
      <body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px;">
          <tr><td align="center">
            <table width="100%" style="max-width:520px;background:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
              <tr>
                <td style="background:linear-gradient(135deg,#064e3b,#0f766e);padding:32px 40px;text-align:center;">
                  <span style="font-size:20px;font-weight:600;color:#f8fafc;">Fresh<span style="color:#34d399;">Route</span></span>
                </td>
              </tr>
              <tr><td style="padding:32px 40px 0;text-align:center;"><div style="font-size:40px;">🔑</div></td></tr>
              <tr>
                <td style="padding:24px 40px 32px;">
                  <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#f1f5f9;text-align:center;">Reset your password</h1>
                  <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;text-align:center;line-height:1.6;">
                    Click below to set a new password. This link expires in <strong style="color:#e2e8f0;">1 hour</strong>.
                  </p>
                  <div style="text-align:center;">
                    <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#059669,#0f766e);color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;">
                      Reset Password
                    </a>
                  </div>
                  <p style="margin:24px 0 0;font-size:12px;color:#475569;text-align:center;">
                    If you didn't request this, you can safely ignore this email.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid rgba(255,255,255,0.06);padding:20px 40px;text-align:center;">
                  <p style="margin:0;font-size:11px;color:#334155;">© ${new Date().getFullYear()} FreshRoute · Automated email</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body></html>
    `,
  });
};

// Send a security alert email telling the user their password changed; includes a "Secure My Account" button
export const sendPasswordChangedEmail = async (
  email: string,
  name: string
): Promise<void> => {
  // Build the secure-account link with the user's email pre-filled in the URL
  const secureLink = `${APP_URL}/auth/secure-account?email=${encodeURIComponent(email)}`;

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: "Your FreshRoute password was changed",
    html: `
      <!DOCTYPE html><html lang="en">
      <head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
      <body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px;">
          <tr><td align="center">
            <table width="100%" style="max-width:520px;background:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
              <tr>
                <td style="background:linear-gradient(135deg,#064e3b,#0f766e);padding:32px 40px;text-align:center;">
                  <span style="font-size:20px;font-weight:600;color:#f8fafc;">Fresh<span style="color:#34d399;">Route</span></span>
                </td>
              </tr>
              <tr><td style="padding:32px 40px 0;text-align:center;"><div style="font-size:40px;">🔐</div></td></tr>
              <tr>
                <td style="padding:24px 40px 32px;">
                  <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#f1f5f9;text-align:center;">Password changed</h1>
                  <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;text-align:center;line-height:1.6;">
                    Hi <strong style="color:#e2e8f0;">${name}</strong>, your FreshRoute password was just updated.
                  </p>
                  <div style="background:rgba(15,23,42,0.6);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin-bottom:24px;">
                    <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
                      📅 <strong style="color:#94a3b8;">When:</strong> ${new Date().toUTCString()}<br/>
                      ✅ <strong style="color:#94a3b8;">If this was you:</strong> No action needed!
                    </p>
                  </div>
                  <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:16px 20px;margin-bottom:28px;">
                    <p style="margin:0 0 12px;font-size:13px;color:#fca5a5;font-weight:600;">⚠️ Wasn't you?</p>
                    <p style="margin:0;font-size:13px;color:#f87171;line-height:1.6;">
                      Click below immediately to lock your account and invalidate all active sessions.
                    </p>
                  </div>
                  <div style="text-align:center;">
                    <a href="${secureLink}" style="display:inline-block;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;">
                      🔒 Secure My Account
                    </a>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid rgba(255,255,255,0.06);padding:20px 40px;text-align:center;">
                  <p style="margin:0;font-size:11px;color:#334155;">© ${new Date().getFullYear()} FreshRoute · Automated security email</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body></html>
    `,
  });
};

// Send a welcome email telling the user their account has been approved by an admin
export const sendApprovalEmail = async (
  email: string,
  name: string
): Promise<void> => {
  // Link to the sign-in page so the user can log in right away
  const signInLink = `${APP_URL}/signin`;

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: "✅ Your FreshRoute account has been approved!",
    html: `
      <!DOCTYPE html><html lang="en">
      <head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
      <body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px;">
          <tr><td align="center">
            <table width="100%" style="max-width:520px;background:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
              <tr>
                <td style="background:linear-gradient(135deg,#064e3b,#0f766e);padding:32px 40px;text-align:center;">
                  <span style="font-size:20px;font-weight:600;color:#f8fafc;">Fresh<span style="color:#34d399;">Route</span></span>
                </td>
              </tr>
              <tr><td style="padding:32px 40px 0;text-align:center;"><div style="font-size:40px;">🎉</div></td></tr>
              <tr>
                <td style="padding:24px 40px 32px;">
                  <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#f1f5f9;text-align:center;">You're approved!</h1>
                  <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;text-align:center;line-height:1.6;">
                    Hi <strong style="color:#e2e8f0;">${name}</strong>, great news — your FreshRoute account has been
                    <strong style="color:#34d399;">approved</strong> by our team. You can now sign in and get started.
                  </p>
                  <div style="background:rgba(4,120,87,0.12);border:1px solid rgba(52,211,153,0.2);border-radius:12px;padding:16px 20px;margin-bottom:28px;">
                    <p style="margin:0;font-size:13px;color:#6ee7b7;line-height:1.8;">
                      ✅ &nbsp;<strong style="color:#a7f3d0;">Browse products</strong> and place orders<br/>
                      ✅ &nbsp;<strong style="color:#a7f3d0;">Track your deliveries</strong> in real time<br/>
                      ✅ &nbsp;<strong style="color:#a7f3d0;">Manage your profile</strong> and preferences
                    </p>
                  </div>
                  <div style="text-align:center;">
                    <a href="${signInLink}" style="display:inline-block;background:linear-gradient(135deg,#059669,#0f766e);color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;">
                      Sign In to FreshRoute
                    </a>
                  </div>
                  <p style="margin:24px 0 0;font-size:12px;color:#475569;text-align:center;">
                    If you didn't register for FreshRoute, you can safely ignore this email.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid rgba(255,255,255,0.06);padding:20px 40px;text-align:center;">
                  <p style="margin:0;font-size:11px;color:#334155;">© ${new Date().getFullYear()} FreshRoute · Automated email</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body></html>
    `,
  });
};

// Send a rejection email explaining why the account was not approved; includes a re-apply button
export const sendRejectionEmail = async (
  email: string,
  name: string,
  reason: string
): Promise<void> => {
  // Link to the signup page so the user can re-register with corrected details
  const signUpLink = `${APP_URL}/signup`;

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: "Update on your FreshRoute registration",
    html: `
      <!DOCTYPE html><html lang="en">
      <head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
      <body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px;">
          <tr><td align="center">
            <table width="100%" style="max-width:520px;background:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
              <tr>
                <td style="background:linear-gradient(135deg,#064e3b,#0f766e);padding:32px 40px;text-align:center;">
                  <span style="font-size:20px;font-weight:600;color:#f8fafc;">Fresh<span style="color:#34d399;">Route</span></span>
                </td>
              </tr>
              <tr><td style="padding:32px 40px 0;text-align:center;"><div style="font-size:40px;">📋</div></td></tr>
              <tr>
                <td style="padding:24px 40px 32px;">
                  <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#f1f5f9;text-align:center;">Registration update</h1>
                  <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;text-align:center;line-height:1.6;">
                    Hi <strong style="color:#e2e8f0;">${name}</strong>, after reviewing your registration our team was
                    unable to approve your account at this time.
                  </p>
                  <div style="background:rgba(15,23,42,0.6);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin-bottom:24px;">
                    <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Reason</p>
                    <p style="margin:0;font-size:14px;color:#cbd5e1;line-height:1.6;">${reason}</p>
                  </div>
                  <div style="background:rgba(14,165,233,0.08);border:1px solid rgba(14,165,233,0.2);border-radius:12px;padding:16px 20px;margin-bottom:28px;">
                    <p style="margin:0;font-size:13px;color:#7dd3fc;line-height:1.6;">
                      💡 If you believe this is a mistake or have updated details, you're welcome to re-register
                      or contact our support team for assistance.
                    </p>
                  </div>
                  <div style="text-align:center;">
                    <a href="${signUpLink}" style="display:inline-block;background:linear-gradient(135deg,#059669,#0f766e);color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;">
                      Re-apply on FreshRoute
                    </a>
                  </div>
                  <p style="margin:24px 0 0;font-size:12px;color:#475569;text-align:center;">
                    If you didn't register for FreshRoute, you can safely ignore this email.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid rgba(255,255,255,0.06);padding:20px 40px;text-align:center;">
                  <p style="margin:0;font-size:11px;color:#334155;">© ${new Date().getFullYear()} FreshRoute · Automated email</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body></html>
    `,
  });
};