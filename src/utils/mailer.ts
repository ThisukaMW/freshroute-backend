import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
} as any);

transporter.verify((error) => {
  if (error) {
    console.error("❌ Email transporter failed:", error);
  } else {
    console.log("✅ Email transporter ready");
  }
});

const FROM = `"FreshRoute" <${process.env.EMAIL_USER}>`;
const APP_URL = process.env.CLIENT_URL ?? "http://localhost:5173";

// ---- 1. Password reset link ----
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

// ---- 2. Password changed + secure my account ----
export const sendPasswordChangedEmail = async (
  email: string,
  name: string
): Promise<void> => {
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
