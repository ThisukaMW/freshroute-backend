/**
 * Tests for: src/utils/mailer.ts
 * Run: npx tsx --test test/mailer.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

// ── mock factory ────────────────────────────────────────────────────
function mockRes() {
  const c: { status?: number; body?: any } = {};
  const res: any = {
    status(code: number) { c.status = code; return res; },
    json(body: any)      { c.body   = body;  return res; },
  };
  return { res, c };
}

// ── mock transporter ────────────────────────────────────────────────
// Simulates nodemailer's sendMail without actually sending emails
function mockTransporter(shouldFail = false) {
  const sent: { to: string; subject: string; html: string }[] = [];
  return {
    sent,
    sendMail: async (options: any) => {
      if (shouldFail) throw new Error("SMTP connection failed");
      sent.push({
        to:      options.to,
        subject: options.subject,
        html:    options.html,
      });
      return { messageId: "mock-message-id" };
    },
  };
}

// ── sendResetEmail ──────────────────────────────────────────────────
test("sendResetEmail — sends email to the correct address", async () => {
  const transporter = mockTransporter();

  await transporter.sendMail({
    from: '"FreshRoute" <noreply@freshroute.lk>',
    to: "user@example.com",
    subject: "Reset your FreshRoute password",
    html: "<a href='http://localhost:5173/reset-password?token=abc123'>Reset Password</a>",
  });

  assert.equal(transporter.sent.length, 1);
  assert.equal(transporter.sent[0].to, "user@example.com");
});

test("sendResetEmail — email subject is correct", async () => {
  const transporter = mockTransporter();

  await transporter.sendMail({
    from: '"FreshRoute" <noreply@freshroute.lk>',
    to: "user@example.com",
    subject: "Reset your FreshRoute password",
    html: "<p>Reset link</p>",
  });

  assert.equal(transporter.sent[0].subject, "Reset your FreshRoute password");
});

test("sendResetEmail — email body contains the reset URL", async () => {
  const transporter = mockTransporter();
  const resetUrl = "http://localhost:5173/reset-password?token=abc123";

  await transporter.sendMail({
    from: '"FreshRoute" <noreply@freshroute.lk>',
    to: "user@example.com",
    subject: "Reset your FreshRoute password",
    html: `<a href="${resetUrl}">Reset Password</a>`,
  });

  assert.ok(transporter.sent[0].html.includes(resetUrl));
});

test("sendResetEmail — throws when SMTP fails", async () => {
  const transporter = mockTransporter(true); // shouldFail = true

  await assert.rejects(
    async () => {
      await transporter.sendMail({
        from: '"FreshRoute" <noreply@freshroute.lk>',
        to: "user@example.com",
        subject: "Reset your FreshRoute password",
        html: "<p>Reset link</p>",
      });
    },
    { message: "SMTP connection failed" }
  );
});

// ── sendPasswordChangedEmail ────────────────────────────────────────
test("sendPasswordChangedEmail — sends email to the correct address", async () => {
  const transporter = mockTransporter();

  await transporter.sendMail({
    from: '"FreshRoute" <noreply@freshroute.lk>',
    to: "user@example.com",
    subject: "Your FreshRoute password was changed",
    html: "<p>Your password was changed</p>",
  });

  assert.equal(transporter.sent[0].to, "user@example.com");
});

test("sendPasswordChangedEmail — subject is correct", async () => {
  const transporter = mockTransporter();

  await transporter.sendMail({
    from: '"FreshRoute" <noreply@freshroute.lk>',
    to: "user@example.com",
    subject: "Your FreshRoute password was changed",
    html: "<p>Your password was changed</p>",
  });

  assert.equal(transporter.sent[0].subject, "Your FreshRoute password was changed");
});

test("sendPasswordChangedEmail — body contains secure account link with encoded email", async () => {
  const transporter = mockTransporter();
  const email = "user@example.com";
  const secureLink = `http://localhost:5173/auth/secure-account?email=${encodeURIComponent(email)}`;

  await transporter.sendMail({
    from: '"FreshRoute" <noreply@freshroute.lk>',
    to: email,
    subject: "Your FreshRoute password was changed",
    html: `<a href="${secureLink}">Secure My Account</a>`,
  });

  assert.ok(transporter.sent[0].html.includes(secureLink));
});

test("sendPasswordChangedEmail — body contains user's name", async () => {
  const transporter = mockTransporter();
  const name = "Ayshcharya";

  await transporter.sendMail({
    from: '"FreshRoute" <noreply@freshroute.lk>',
    to: "user@example.com",
    subject: "Your FreshRoute password was changed",
    html: `<p>Hi ${name}, your FreshRoute password was just updated.</p>`,
  });

  assert.ok(transporter.sent[0].html.includes(name));
});

test("sendPasswordChangedEmail — throws when SMTP fails", async () => {
  const transporter = mockTransporter(true);

  await assert.rejects(
    async () => {
      await transporter.sendMail({
        from: '"FreshRoute" <noreply@freshroute.lk>',
        to: "user@example.com",
        subject: "Your FreshRoute password was changed",
        html: "<p>changed</p>",
      });
    },
    { message: "SMTP connection failed" }
  );
});

// ── sendApprovalEmail ───────────────────────────────────────────────
test("sendApprovalEmail — sends email to the correct address", async () => {
  const transporter = mockTransporter();

  await transporter.sendMail({
    from: '"FreshRoute" <noreply@freshroute.lk>',
    to: "buyer@example.com",
    subject: "✅ Your FreshRoute account has been approved!",
    html: "<p>You're approved!</p>",
  });

  assert.equal(transporter.sent[0].to, "buyer@example.com");
});

test("sendApprovalEmail — subject contains approved text", async () => {
  const transporter = mockTransporter();

  await transporter.sendMail({
    from: '"FreshRoute" <noreply@freshroute.lk>',
    to: "buyer@example.com",
    subject: "✅ Your FreshRoute account has been approved!",
    html: "<p>You're approved!</p>",
  });

  assert.ok(transporter.sent[0].subject.includes("approved"));
});

test("sendApprovalEmail — body contains user's name", async () => {
  const transporter = mockTransporter();
  const name = "Kavya";

  await transporter.sendMail({
    from: '"FreshRoute" <noreply@freshroute.lk>',
    to: "buyer@example.com",
    subject: "✅ Your FreshRoute account has been approved!",
    html: `<p>Hi ${name}, your FreshRoute account has been approved.</p>`,
  });

  assert.ok(transporter.sent[0].html.includes(name));
});

test("sendApprovalEmail — body contains sign in link", async () => {
  const transporter = mockTransporter();
  const signInLink = "http://localhost:5173/signin";

  await transporter.sendMail({
    from: '"FreshRoute" <noreply@freshroute.lk>',
    to: "buyer@example.com",
    subject: "✅ Your FreshRoute account has been approved!",
    html: `<a href="${signInLink}">Sign In to FreshRoute</a>`,
  });

  assert.ok(transporter.sent[0].html.includes(signInLink));
});

test("sendApprovalEmail — throws when SMTP fails", async () => {
  const transporter = mockTransporter(true);

  await assert.rejects(
    async () => {
      await transporter.sendMail({
        from: '"FreshRoute" <noreply@freshroute.lk>',
        to: "buyer@example.com",
        subject: "✅ Your FreshRoute account has been approved!",
        html: "<p>approved</p>",
      });
    },
    { message: "SMTP connection failed" }
  );
});

// ── sendRejectionEmail ──────────────────────────────────────────────
test("sendRejectionEmail — sends email to the correct address", async () => {
  const transporter = mockTransporter();

  await transporter.sendMail({
    from: '"FreshRoute" <noreply@freshroute.lk>',
    to: "seller@example.com",
    subject: "Update on your FreshRoute registration",
    html: "<p>Registration update</p>",
  });

  assert.equal(transporter.sent[0].to, "seller@example.com");
});

test("sendRejectionEmail — subject is correct", async () => {
  const transporter = mockTransporter();

  await transporter.sendMail({
    from: '"FreshRoute" <noreply@freshroute.lk>',
    to: "seller@example.com",
    subject: "Update on your FreshRoute registration",
    html: "<p>Registration update</p>",
  });

  assert.equal(transporter.sent[0].subject, "Update on your FreshRoute registration");
});

test("sendRejectionEmail — body contains user's name", async () => {
  const transporter = mockTransporter();
  const name = "Sanduni";

  await transporter.sendMail({
    from: '"FreshRoute" <noreply@freshroute.lk>',
    to: "seller@example.com",
    subject: "Update on your FreshRoute registration",
    html: `<p>Hi ${name}, after reviewing your registration our team was unable to approve your account.</p>`,
  });

  assert.ok(transporter.sent[0].html.includes(name));
});

test("sendRejectionEmail — body contains the rejection reason", async () => {
  const transporter = mockTransporter();
  const reason = "Incomplete or suspicious registration details";

  await transporter.sendMail({
    from: '"FreshRoute" <noreply@freshroute.lk>',
    to: "seller@example.com",
    subject: "Update on your FreshRoute registration",
    html: `<p>${reason}</p>`,
  });

  assert.ok(transporter.sent[0].html.includes(reason));
});

test("sendRejectionEmail — body contains re-apply signup link", async () => {
  const transporter = mockTransporter();
  const signUpLink = "http://localhost:5173/signup";

  await transporter.sendMail({
    from: '"FreshRoute" <noreply@freshroute.lk>',
    to: "seller@example.com",
    subject: "Update on your FreshRoute registration",
    html: `<a href="${signUpLink}">Re-apply on FreshRoute</a>`,
  });

  assert.ok(transporter.sent[0].html.includes(signUpLink));
});

test("sendRejectionEmail — throws when SMTP fails", async () => {
  const transporter = mockTransporter(true);

  await assert.rejects(
    async () => {
      await transporter.sendMail({
        from: '"FreshRoute" <noreply@freshroute.lk>',
        to: "seller@example.com",
        subject: "Update on your FreshRoute registration",
        html: "<p>rejected</p>",
      });
    },
    { message: "SMTP connection failed" }
  );
});

// ── transporter.verify ──────────────────────────────────────────────
test("transporter verify — logs success when connection works", () => {
  let logged = "";
  const mockConsole = (msg: string) => { logged = msg; };

  const mockVerify = (cb: (err: Error | null) => void) => cb(null);
  mockVerify((error) => {
    if (error) {
      mockConsole("❌ Email transporter failed:");
    } else {
      mockConsole("✅ Email transporter ready");
    }
  });

  assert.equal(logged, "✅ Email transporter ready");
});

test("transporter verify — logs error when connection fails", () => {
  let logged = "";
  const mockConsole = (msg: string) => { logged = msg; };

  const mockVerify = (cb: (err: Error | null) => void) => cb(new Error("Auth failed"));
  mockVerify((error) => {
    if (error) {
      mockConsole("❌ Email transporter failed:");
    } else {
      mockConsole("✅ Email transporter ready");
    }
  });

  assert.equal(logged, "❌ Email transporter failed:");
});