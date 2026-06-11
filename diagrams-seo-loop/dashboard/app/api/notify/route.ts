/**
 * POST /api/notify
 *
 * Sends a user-facing nurture email (prototype: delivered to operator inbox).
 * Email content branches on decision_action so each user segment gets a
 * meaningfully different message — not the same 3-step sequence for everyone.
 *
 * decision_action routing:
 *   none                        → no email sent (returns { ok: true, skipped: true })
 *   educational_email           → standard 3-step nurture (same as before)
 *   high_intent_followup        → momentum-driven sequence
 *   free_limit_conversion       → urgent upgrade sequence
 *   champion_outreach           → high-touch personal sequence
 *   team_collaboration_followup → team plan pitch sequence
 *   returning_user_nurture      → re-engagement sequence
 *   upgrade_email               → direct upgrade ask
 *
 * Required environment variables (set in .env.local):
 *   NOTIFY_EMAIL              — Gmail address (sender + recipient in prototype)
 *   NOTIFY_GMAIL_APP_PASSWORD — 16-char App Password from Google Account settings
 */

import { NextResponse } from "next/server";
import nodemailer       from "nodemailer";
import { sanitizeSuggestionField } from "@/lib/conversion-suggestions";

type DecisionAction =
  | "none"
  | "educational_email"
  | "upgrade_email"
  | "champion_outreach"
  | "team_collaboration_followup"
  | "returning_user_nurture"
  | "free_limit_conversion"
  | "high_intent_followup";

interface NotifyBody {
  diagram_title:            string;
  diagram_id:               string;
  user_prompt?:             string;
  suggestion_1_title:       string;
  suggestion_1_description: string;
  suggestion_2_title:       string;
  suggestion_2_description: string;
  /** Which step in the sequence: 1 = immediate, 2 = day 3, 3 = day 7 */
  email_step?:              1 | 2 | 3;
  user_context?:            { role?: string; company_type?: string };
  /** AI Decision Engine recommendation — drives email content branching */
  decision_action?:         DecisionAction;
}

// ── Shared types for email builders ──────────────────────────────────────────

interface EmailParams {
  diagram_title:            string;
  diagram_id:               string;
  user_prompt?:             string;
  suggestion_1_title:       string;
  suggestion_1_description: string;
  suggestion_2_title:       string;
  suggestion_2_description: string;
  role:                     string;
  company_type:             string;
  step:                     1 | 2 | 3;
}

// ── URL helpers ───────────────────────────────────────────────────────────────

const BASE        = "http://localhost:3000";
const upgradeUrl  = `${BASE}/upgrade`;
const generateUrl = `${BASE}/generate`;

function sharedUrl(id: string)  { return `${BASE}/shared/${id}`; }

function footer(step: number, role: string, company_type: string, user_prompt?: string): string {
  return `\n---\n[PROTOTYPE — operator preview]\nStep ${step} of 3-part sequence.\nInferred role: ${role} at a ${company_type}.\n${user_prompt ? `Original prompt: "${user_prompt.slice(0, 200)}"` : ""}\nReview queue: ${BASE}`;
}

// ── Email sequences per decision_action ──────────────────────────────────────
//
// Each function receives the full params + step number and returns { subject, text }.
// This keeps every sequence self-contained and easy to read/edit independently.

function emailEducational(p: EmailParams): { subject: string; text: string } {
  const f = footer(p.step, p.role, p.company_type, p.user_prompt);

  if (p.step === 1) return {
    subject: `Your ${p.diagram_title} diagram — 2 Pro upgrades to try next`,
    text: `Hi there,

You just created "${p.diagram_title}" on Diagrams.so — nice work.

View your diagram:
${sharedUrl(p.diagram_id)}

As a ${p.role} at a ${p.company_type}, you'll likely need a production-grade version soon. With Pro you can generate either of these in one prompt:

1. ${p.suggestion_1_title}
   ${p.suggestion_1_description}

2. ${p.suggestion_2_title}
   ${p.suggestion_2_description}

Generate your next version:
${generateUrl}

— The Diagrams.so team${f}`,
  };

  if (p.step === 2) return {
    subject: `${p.diagram_title} — here's what a production-grade version looks like`,
    text: `Hi there,

A few days ago you created "${p.diagram_title}". Here's the more complex, production-grade version that most ${p.company_type} teams end up needing:

${p.suggestion_1_title}
${p.suggestion_1_description}

This adds the security hardening, multi-region resilience, or compliance controls that the free-tier sketch leaves out. As a ${p.role}, you've probably already thought about half of these gaps.

Generate this follow-up with one prompt on Pro:
${generateUrl}

— The Diagrams.so team${f}`,
  };

  return {
    subject: `You're almost at your free diagram limit — upgrade before you hit it`,
    text: `Hi there,

You've been using Diagrams.so to map out your architecture — free tier gives you 3 diagrams.

You generated "${p.diagram_title}" and explored production-grade follow-ups. Most ${p.role}s in a ${p.company_type} use 5–10 diagrams per sprint.

When you hit the limit you'll lose the ability to generate follow-ups mid-session. Upgrade now to keep the momentum:
${upgradeUrl}

Pro unlocks:
- Unlimited diagram generation
- Production-grade follow-ups (${p.suggestion_2_title})
- Export to Confluence, Notion, Figma

— The Diagrams.so team${f}`,
  };
}

function emailHighIntent(p: EmailParams): { subject: string; text: string } {
  const f = footer(p.step, p.role, p.company_type, p.user_prompt);

  if (p.step === 1) return {
    subject: `You've been busy — ${p.diagram_title} and what comes next`,
    text: `Hi there,

You've been generating architecture diagrams at a serious pace. "${p.diagram_title}" is your latest — and based on your activity, you're probably already thinking about the next layer of complexity.

View your diagram:
${sharedUrl(p.diagram_id)}

Here's exactly what that next level looks like:

→ ${p.suggestion_1_title}
   ${p.suggestion_1_description}

→ ${p.suggestion_2_title}
   ${p.suggestion_2_description}

Most ${p.role}s at ${p.company_type}s hit the free tier limit right when they're mid-session on a complex architecture. Upgrade now to avoid the interruption:
${upgradeUrl}

— The Diagrams.so team${f}`,
  };

  if (p.step === 2) return {
    subject: `The production architecture you're building toward`,
    text: `Hi there,

You've been generating diagrams consistently, which tells us you're working on something real — not just experimenting.

"${p.diagram_title}" is a solid foundation. The production-grade version most ${p.role}s end up needing is:

${p.suggestion_1_title}
${p.suggestion_1_description}

The gap between what you've built and what production requires is exactly what Pro bridges. One prompt generates the whole thing.

${generateUrl}

— The Diagrams.so team${f}`,
  };

  return {
    subject: `You're generating fast — upgrade before you hit the wall`,
    text: `Hi there,

At your current generation pace, you'll hit the free tier limit in your next session. That's the worst time to be interrupted — mid-architecture, mid-thought.

You generated "${p.diagram_title}" and several others. The Pro plan removes the limit entirely.

${upgradeUrl}

What Pro gives a ${p.role} at a ${p.company_type}:
- Unlimited generations — no more hitting walls mid-session
- ${p.suggestion_1_title}
- ${p.suggestion_2_title}
- Export to Confluence, Notion, Figma

— The Diagrams.so team${f}`,
  };
}

function emailFreeLimitConversion(p: EmailParams): { subject: string; text: string } {
  const f = footer(p.step, p.role, p.company_type, p.user_prompt);

  if (p.step === 1) return {
    subject: `You've hit your free diagram limit — here's how to keep going`,
    text: `Hi there,

You just hit the Diagrams.so free tier limit. That means you've generated enough diagrams to know the tool works — and now you're blocked at exactly the wrong moment.

Your last diagram: "${p.diagram_title}"
${sharedUrl(p.diagram_id)}

The production-grade follow-up you probably want next:

→ ${p.suggestion_1_title}
   ${p.suggestion_1_description}

You can't generate it on the free tier. But you can on Pro.

Upgrade now and generate it immediately:
${upgradeUrl}

This is a one-click unlock. No trial, no waiting.

— The Diagrams.so team${f}`,
  };

  if (p.step === 2) return {
    subject: `Still blocked by the free limit? One upgrade fixes it`,
    text: `Hi there,

A few days ago you hit the free tier limit on Diagrams.so. If you haven't upgraded yet, you're still blocked from generating the production-grade architecture you need.

The follow-up to "${p.diagram_title}" that most ${p.role}s generate next:

${p.suggestion_1_title}
${p.suggestion_1_description}

It's one prompt away — but only on Pro.

${upgradeUrl}

— The Diagrams.so team${f}`,
  };

  return {
    subject: `Last reminder: you hit the free limit — upgrade when you're ready`,
    text: `Hi there,

You hit the free diagram limit on Diagrams.so a week ago. Whenever you're ready to generate again:

${upgradeUrl}

What you unlock:
- Unlimited diagram generations
- ${p.suggestion_1_title}
- ${p.suggestion_2_title}
- Export to Confluence, Notion, Figma

— The Diagrams.so team${f}`,
  };
}

function emailChampionOutreach(p: EmailParams): { subject: string; text: string } {
  const f = footer(p.step, p.role, p.company_type, p.user_prompt);

  if (p.step === 1) return {
    subject: `You're one of our most active users — wanted to reach out`,
    text: `Hi there,

You're one of the most active users on Diagrams.so. As a ${p.role} at a ${p.company_type}, you've generated more diagrams than 95% of our users and you've been sharing them with your team.

That kind of usage tells us you're solving real problems with the tool — not just experimenting.

Your latest: "${p.diagram_title}"
${sharedUrl(p.diagram_id)}

We wanted to reach out personally. If there's a specific architecture you're trying to map and the free tier is getting in your way, we can help:

→ Extended trial — more generations, no time limit
→ Pro features — ${p.suggestion_1_title}
→ Direct line — reply to this email with what you're building

${upgradeUrl}

— The Diagrams.so team${f}`,
  };

  if (p.step === 2) return {
    subject: `What a Pro account looks like for a ${p.role} like you`,
    text: `Hi there,

Following up from earlier. Based on how you've been using Diagrams.so, here's exactly what Pro would look like for your workflow:

You'd generate "${p.diagram_title}" as a starting point — just like you did. Then immediately generate:

${p.suggestion_1_title}
${p.suggestion_1_description}

Then the multi-region variant:
${p.suggestion_2_title}
${p.suggestion_2_description}

All in one session, no limits, no interruptions. That's the difference between the free tier and Pro for a ${p.role}.

${upgradeUrl}

— The Diagrams.so team${f}`,
  };

  return {
    subject: `Personal offer for power users — let's talk`,
    text: `Hi there,

You've been one of our most engaged users. We don't send this email often.

If you're not on Pro yet and you're still generating on the free tier, reply to this email. We'll work something out — extended trial, custom plan, or just answer your questions before you commit.

You clearly know how to use the tool. We want you on Pro.

${upgradeUrl}

— The Diagrams.so team${f}`,
  };
}

function emailTeamCollaboration(p: EmailParams): { subject: string; text: string } {
  const f = footer(p.step, p.role, p.company_type, p.user_prompt);

  if (p.step === 1) return {
    subject: `Your colleague viewed your diagram — Diagrams.so has a team plan`,
    text: `Hi there,

Someone on your team just viewed your "${p.diagram_title}" diagram. That's the moment when architecture documentation stops being a personal artifact and becomes a shared source of truth.

View the diagram your colleague saw:
${sharedUrl(p.diagram_id)}

When two engineers are reviewing the same diagram, you're in the middle of an architecture decision — not just sketching. That's when you need the production-grade version, not the free-tier sketch.

What your team could generate next:

→ ${p.suggestion_1_title}
   ${p.suggestion_1_description}

→ ${p.suggestion_2_title}
   ${p.suggestion_2_description}

The team plan lets both of you generate, iterate, and share without hitting per-user limits.

${upgradeUrl}

— The Diagrams.so team${f}`,
  };

  if (p.step === 2) return {
    subject: `Two engineers, one architecture — here's the team workflow`,
    text: `Hi there,

A few days ago your colleague viewed "${p.diagram_title}". Teams that share architecture diagrams during evaluation are usually 2–3 weeks from a decision.

Here's what a collaborative architecture review on Pro looks like:
- You generate the base diagram
- Your colleague generates the security-hardened variant: ${p.suggestion_1_title}
- You generate the multi-region version: ${p.suggestion_2_title}
- All three diagrams live in a shared workspace, linked and versioned

${upgradeUrl}

— The Diagrams.so team${f}`,
  };

  return {
    subject: `Your team is ready for a shared plan — here's what fits`,
    text: `Hi there,

You've been sharing diagrams with your team for a week now. The free tier is built for individuals. The team plan is built for exactly what you're doing.

What changes with a team plan:
- Shared diagram library — no more sending links via Slack
- Any teammate can generate follow-ups without hitting your limit
- ${p.suggestion_1_title} available to everyone on the team
- Export to Confluence for permanent docs

${upgradeUrl}

— The Diagrams.so team${f}`,
  };
}

function emailReturningUser(p: EmailParams): { subject: string; text: string } {
  const f = footer(p.step, p.role, p.company_type, p.user_prompt);

  if (p.step === 1) return {
    subject: `Welcome back — here's what to generate next`,
    text: `Hi there,

You came back to Diagrams.so after a break. That tells us "${p.diagram_title}" solved something real — real enough to bring you back.

View your diagram:
${sharedUrl(p.diagram_id)}

Since your last visit, you could generate the production-grade follow-up you were probably thinking about:

→ ${p.suggestion_1_title}
   ${p.suggestion_1_description}

→ ${p.suggestion_2_title}
   ${p.suggestion_2_description}

Both available on Pro. Generate them directly from your last diagram spec — no starting over.

${upgradeUrl}

— The Diagrams.so team${f}`,
  };

  if (p.step === 2) return {
    subject: `You came back — let's build the next level`,
    text: `Hi there,

Users who return to Diagrams.so after 7+ days almost always have a new problem to solve. The first diagram convinced you the tool works. The second visit is when you go deeper.

${p.suggestion_1_title} is the architecture most ${p.role}s generate on their second session. It takes your "${p.diagram_title}" foundation and adds the layers that production actually needs.

${generateUrl}

— The Diagrams.so team${f}`,
  };

  return {
    subject: `You keep coming back — here's why Pro makes sense now`,
    text: `Hi there,

You've returned to Diagrams.so multiple times. That pattern is clear: the tool is part of how you think through architecture problems.

At that point, the free tier starts getting in the way. Three diagrams per session isn't enough for a ${p.role} at a ${p.company_type} who's actively designing systems.

Pro removes every limit. One upgrade, permanent unlock.

${upgradeUrl}

What Pro adds to your workflow:
- Unlimited generations — generate and iterate without counting
- ${p.suggestion_1_title}
- ${p.suggestion_2_title}

— The Diagrams.so team${f}`,
  };
}

function emailUpgrade(p: EmailParams): { subject: string; text: string } {
  const f = footer(p.step, p.role, p.company_type, p.user_prompt);

  if (p.step === 1) return {
    subject: `Ready to go Pro? Here's exactly what you unlock`,
    text: `Hi there,

You generated "${p.diagram_title}" on Diagrams.so. Based on your activity, you're close to needing more than the free tier offers.

Here's what Pro unlocks for a ${p.role} at a ${p.company_type}:

→ ${p.suggestion_1_title}
   ${p.suggestion_1_description}

→ ${p.suggestion_2_title}
   ${p.suggestion_2_description}

→ Unlimited diagram generations
→ Export to Confluence, Notion, Figma

${upgradeUrl}

— The Diagrams.so team${f}`,
  };

  if (p.step === 2) return {
    subject: `Still on the free tier? Here's the nudge`,
    text: `Hi there,

Your "${p.diagram_title}" is sitting in your queue. The production-grade follow-up is one upgrade away.

${p.suggestion_1_title}: ${p.suggestion_1_description}

${upgradeUrl}

— The Diagrams.so team${f}`,
  };

  return {
    subject: `Final reminder — Pro is waiting whenever you're ready`,
    text: `Hi there,

Last email on this. Whenever you're ready to go beyond the free tier:

${upgradeUrl}

What you unlock: unlimited generations, ${p.suggestion_1_title}, ${p.suggestion_2_title}, and export to Confluence, Notion, Figma.

— The Diagrams.so team${f}`,
  };
}

// ── Router — pick the right email sequence ────────────────────────────────────

function buildEmailContent(
  action: DecisionAction,
  params: EmailParams,
): { subject: string; text: string } | null {
  if (action === "none") return null;

  switch (action) {
    case "free_limit_conversion":       return emailFreeLimitConversion(params);
    case "champion_outreach":           return emailChampionOutreach(params);
    case "team_collaboration_followup": return emailTeamCollaboration(params);
    case "returning_user_nurture":      return emailReturningUser(params);
    case "high_intent_followup":        return emailHighIntent(params);
    case "upgrade_email":               return emailUpgrade(params);
    case "educational_email":
    default:                            return emailEducational(params);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const email    = process.env.NOTIFY_EMAIL;
  const password = process.env.NOTIFY_GMAIL_APP_PASSWORD;

  if (!email || !password) {
    console.error("[notify] Missing NOTIFY_EMAIL or NOTIFY_GMAIL_APP_PASSWORD in .env.local");
    return NextResponse.json({ ok: false, error: "Email not configured" }, { status: 500 });
  }

  let body: NotifyBody;
  try {
    body = (await req.json()) as NotifyBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const diagram_title            = sanitizeSuggestionField(body.diagram_title            ?? "");
  const diagram_id               = body.diagram_id;
  const user_prompt              = body.user_prompt;
  const suggestion_1_title       = sanitizeSuggestionField(body.suggestion_1_title       ?? "");
  const suggestion_1_description = sanitizeSuggestionField(body.suggestion_1_description ?? "");
  const suggestion_2_title       = sanitizeSuggestionField(body.suggestion_2_title       ?? "");
  const suggestion_2_description = sanitizeSuggestionField(body.suggestion_2_description ?? "");
  const email_step               = body.email_step ?? 1;
  const role                     = body.user_context?.role         ?? "Software Engineer";
  const company_type             = body.user_context?.company_type ?? "Tech Company";
  const decision_action          = (body.decision_action ?? "educational_email") as DecisionAction;

  if (!diagram_id || !diagram_title) {
    return NextResponse.json({ ok: false, error: "diagram_id and diagram_title required" }, { status: 400 });
  }

  // decision_action = "none" means the engine decided not to contact this user
  if (decision_action === "none") {
    console.log(`[notify] Skipping email for ${diagram_id} — decision_action is 'none'`);
    return NextResponse.json({ ok: true, skipped: true, reason: "decision_action is none" });
  }

  const content = buildEmailContent(decision_action, {
    diagram_title,
    diagram_id,
    user_prompt,
    suggestion_1_title,
    suggestion_1_description,
    suggestion_2_title,
    suggestion_2_description,
    role,
    company_type,
    step: email_step,
  });

  if (!content) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no content for this action/step" });
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: email, pass: password },
  });

  try {
    await transporter.sendMail({
      from:    `"Diagrams.so" <${email}>`,
      to:      email,
      subject: content.subject,
      text:    content.text,
    });
    return NextResponse.json({ ok: true, email_step, decision_action });
  } catch (err) {
    console.error("[notify] Failed to send email:", err);
    return NextResponse.json({ ok: false, error: "Send failed" }, { status: 500 });
  }
}
