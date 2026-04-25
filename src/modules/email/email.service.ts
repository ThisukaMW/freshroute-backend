import nodemailer from "nodemailer";

// ---- transporter (configure via .env) ----
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
} as any);

const FROM = `"FreshRoute" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`;
const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

// ---- password changed notification ----
export const sendPasswordChangedEmail = async (
  email: string,
  name: string
): Promise<void> => {
  const secureLink = `${APP_URL}/auth/secure-account?email=${encodeURIComponent(email)}`;

  await transporter.sendMail({
    from:    FROM,
    to:      email,
    subject: "Your FreshRoute password was changed",
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Password Changed</title>
      </head>
      <body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px;">
          <tr>
            <td align="center">
              <table width="100%" style="max-width:520px;background:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">

                <!-- header -->
                <tr>
                  <td style="background:linear-gradient(135deg,#064e3b,#0f766e);padding:32px 40px;text-align:center;">
                    <div style="display:inline-flex;align-items:center;gap:8px;">
                      <div style="width:36px;height:36px;border-radius:50%;background:rgba(52,211,153,0.2);border:2px solid rgba(52,211,153,0.4);display:inline-flex;align-items:center;justify-content:center;font-weight:700;color:#6ee7b7;font-size:13px;">FR</div>
                      <span style="font-size:20px;font-weight:600;color:#f8fafc;">Fresh<span style="color:#34d399;">Route</span></span>
                    </div>
                  </td>
                </tr>

                <!-- icon -->
                <tr>
                  <td style="padding:32px 40px 0;text-align:center;">
                    <div style="width:56px;height:56px;border-radius:50%;background:rgba(234,179,8,0.15);border:1px solid rgba(234,179,8,0.3);margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:24px;">🔐</div>
                  </td>
                </tr>

                <!-- body -->
                <tr>
                  <td style="padding:24px 40px 32px;">
                    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#f1f5f9;text-align:center;">Password changed</h1>
                    <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;text-align:center;line-height:1.6;">
                      Hi <strong style="color:#e2e8f0;">${name}</strong>, your FreshRoute account password was just updated.
                    </p>

                    <!-- info box -->
                    <div style="background:rgba(15,23,42,0.6);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin-bottom:24px;">
                      <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
                        📅 <strong style="color:#94a3b8;">When:</strong> ${new Date().toUTCString()}<br/>
                        🌐 <strong style="color:#94a3b8;">If this was you:</strong> No action needed — you're all good!
                      </p>
                    </div>

                    <!-- warning -->
                    <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:16px 20px;margin-bottom:28px;">
                      <p style="margin:0 0 12px;font-size:13px;color:#fca5a5;font-weight:600;">⚠️ Wasn't you?</p>
                      <p style="margin:0;font-size:13px;color:#f87171;line-height:1.6;">
                        If you did not make this change, your account may be compromised. Click the button below immediately to lock your account and invalidate all active sessions.
                      </p>
                    </div>

                    <!-- CTA button -->
                    <div style="text-align:center;">
                      <a href="${secureLink}"
                        style="display:inline-block;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;letter-spacing:0.3px;">
                        🔒 Secure My Account
                      </a>
                    </div>

                    <p style="margin:24px 0 0;font-size:12px;color:#475569;text-align:center;line-height:1.6;">
                      This link will lock your account and sign out all devices. You'll need to contact support to recover access.
                    </p>
                  </td>
                </tr>

                <!-- footer -->
                <tr>
                  <td style="border-top:1px solid rgba(255,255,255,0.06);padding:20px 40px;text-align:center;">
                    <p style="margin:0;font-size:11px;color:#334155;">
                      © ${new Date().getFullYear()} FreshRoute · This is an automated security email
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  });
};

// ---- account locked notification ----
export const sendAccountLockedEmail = async (
  email: string,
  name: string
): Promise<void> => {
  await transporter.sendMail({
    from:    FROM,
    to:      email,
    subject: "Your FreshRoute account has been locked",
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Account Locked</title>
      </head>
      <body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px;">
          <tr>
            <td align="center">
              <table width="100%" style="max-width:520px;background:#1e293b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">

                <tr>
                  <td style="background:linear-gradient(135deg,#064e3b,#0f766e);padding:32px 40px;text-align:center;">
                    <span style="font-size:20px;font-weight:600;color:#f8fafc;">Fresh<span style="color:#34d399;">Route</span></span>
                  </td>
                </tr>

                <tr>
                  <td style="padding:32px 40px 0;text-align:center;">
                    <div style="font-size:40px;">🔒</div>
                  </td>
                </tr>

                <tr>
                  <td style="padding:24px 40px 32px;">
                    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#f1f5f9;text-align:center;">Account locked</h1>
                    <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;text-align:center;line-height:1.6;">
                      Hi <strong style="color:#e2e8f0;">${name}</strong>, your account has been locked and all active sessions have been invalidated as requested.
                    </p>
                    <div style="background:rgba(15,23,42,0.6);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 20px;margin-bottom:24px;">
                      <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.8;">
                        To recover your account, please contact our support team and we'll verify your identity and restore access.<br/><br/>
                        📧 <a href="mailto:support@freshroute.lk" style="color:#34d399;">support@freshroute.lk</a>
                      </p>
                    </div>
                  </td>
                </tr>

                <tr>
                  <td style="border-top:1px solid rgba(255,255,255,0.06);padding:20px 40px;text-align:center;">
                    <p style="margin:0;font-size:11px;color:#334155;">© ${new Date().getFullYear()} FreshRoute · Automated security email</p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  });
};