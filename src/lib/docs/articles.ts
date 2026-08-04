import { DocArticle } from './types';

// ─── Documentation content ────────────────────────────────────────────────────
// Generated from the codebase and fact-checked against it. Keep ids stable:
// HelpTip 'Learn more' links and help-page deep links depend on them.

export const DOC_ARTICLES: DocArticle[] = [
  {
    id: "admin-onboarding-guide",
    title: "Administrator Guide: Onboarding Staff",
    category: "Getting Started",
    description: "Step-by-step: add staff to the roster, have them register, send the in-app invite, confirm access, and manage roles and archiving.",
    featured: true,
    audience: "admin",
    content: `
Getting a team member set up in CleanRoute Pro takes three things: a roster entry, a registered account, and an invitation. This guide walks you through the whole process, from adding someone to the roster to confirming they can log in and see their schedule.

## How invitations work

CleanRoute Pro does not send invitation emails. When you send an invite, it appears inside the app, on the person's own dashboard, the next time they log in. Because of this, the order matters:

1. You add the person to your roster with their email address.

2. They register their own CleanRoute Pro account using that same email address.

3. You send the invitation.

4. They log in and accept it on their dashboard.

> If you try to invite someone before they have registered, the invite fails. See Troubleshooting below.

## Step 1: Add the person to your roster

1. Log in on a computer and open **Staff** in the menu. Only owners and admins can see this page.

2. Make sure you are on the **Roster** tab.

3. Click **Add Staff**.

4. Enter their **Full Name** (required), **Email**, **Phone** and **Hourly Rate**. The rate defaults to $38 per hour.

5. Click **Add Staff Member**.

> The email address is essential. Invitations are matched by email, so enter the exact address the person will use to register. Without an email on file you cannot invite them at all.

New staff are recorded with the role of cleaner, and their availability starts as Monday to Friday. You can change which days they work straight from their card — click the **Sun** to **Sat** day buttons in the Available row.

## Step 2: Ask them to register an account

Before you can invite someone, they must create their own CleanRoute Pro account:

1. Ask them to go to the CleanRoute Pro website and open the registration page.

2. They fill in **Email** (the same address you put on the roster), **Password** and **Confirm Password**, then click **Create Account**.

3. After registering they land on a welcome screen headed Welcome to CleanRoute Pro, with two buttons: **Create Organisation** and **Join an Organisation**.

4. Tell them to stop here. They must not click **Create Organisation** — that would set up a brand-new, separate business instead of joining yours.

> If they click **Join an Organisation**, the screen simply shows their email address and explains they need an invitation from you. There is nothing else for them to do until you send the invite.

## Step 3: Send the invitation

1. Back on your **Staff** page, find the person on the **Roster** tab.

2. Click the envelope icon on their card (Send portal invite). You can also use the **Send invite** button next to their name on the **Accounts & Access** tab.

3. You will see a confirmation such as "Invitation created — they will see it when they log in to CleanRoute Pro".

Their badge changes to **Invite pending**. No email is sent — the invitation is waiting for them inside the app.

Every invitation starts at the staff role. You can promote someone to admin or supervisor after they accept — see the Accounts, Permissions & Access Control guide.

## What the invitee sees

The next time the person logs in, a card appears on their dashboard: "You've been invited!", naming your organisation, with two buttons: **Accept Invite** and **Decline**. Clicking **Accept Invite** switches them into your organisation.

Staff use the same website on their phone — there is no separate app to install. They log in on their phone's browser and it automatically shows the mobile My Schedule view.

## Step 4: Confirm it worked

- On the **Roster** tab, their badge changes from **Invite pending** to a green **Active account**.

- On the **Accounts & Access** tab, they now appear in the Active section.

If the badge still shows **Invite pending**, they have not accepted yet — ask them to log in and look for the invitation card on their dashboard.

## Resending an invitation

If a pending invite seems lost, open the **Accounts & Access** tab, find the person under Invite pending, and click **Resend**. On the **Roster** tab, the envelope icon becomes a refresh icon (Resend invite) while an invite is pending. Resending refreshes the same invitation — the person will see it when they next log in.

## Roles at a glance

- Owner and Admin see the full management site: Schedule, Completed, Clients, Templates, Staff, Staff View and Org Settings.

- Supervisor sees My Schedule and Published Schedules.

- Staff see only My Schedule.

Only the owner can change roles, revoke access or remove staff. Admins can add roster entries and send invitations.

## Archiving vs removing

- Archive (the box icon on a staff card) takes someone off the active roster but keeps their record. If they have portal access or a pending invite, archiving revokes that access first. Archived staff sit in a collapsible Archived list with a **Restore** button. Restoring puts them back on the roster but does not restore their login — send a fresh invite if they need access again.

- Remove (the bin icon) permanently deletes their roster record and their schedule assignments, and revokes any access. A confirmation dialog appears first; click **Remove staff** to confirm. This cannot be undone.

In both cases the person's own login is disconnected from your organisation, not deleted by you. If yours was their only organisation, they will simply land on the welcome screen next time they log in.

## Troubleshooting

- The invite fails with "User not found. This person does not have an account yet. Ask them to create an account at CleanRoute Pro first, then try inviting them again." — They have not registered, or they registered with a different email. Confirm they finished Step 2 using the exact email on their roster card.

- "needs an email address. Edit their profile first." — The roster entry has no email. Click the pencil icon on their card, add the email, save, then invite again.

- "This person already has access to your organisation" — They already accepted an earlier invite. Check the **Accounts & Access** tab; they should be listed as Active.

- Wrong email on the roster — Click the pencil icon to edit the staff member, correct the email, then send the invite again.

- The person cannot see the invitation — Make sure they registered with the same email you invited, and that they are looking at their dashboard after logging in. The invitation card sits on the welcome screen. If they already belong to another organisation, a notification badge appears in their dashboard instead, which opens a Pending Invitations window.

- Archiving fails with "Only the owner can remove staff" — Archiving someone who has portal access also revokes that access, and only the owner can revoke access. Ask the owner to archive them instead.
`,
  },
  {
    id: "staff-onboarding-guide",
    title: "Staff Guide: Getting Started",
    category: "Getting Started",
    description: "Hand-out guide for new cleaning staff: create your account, accept your invitation and find your schedule on your phone.",
    featured: true,
    audience: "all",
    content: `
Welcome to the team! CleanRoute Pro is where you will find your cleaning schedule each week — which jobs you are doing, what time to start, who you are working with, and the checklist to sign off at each job. This guide walks you through joining your company's account and finding your way around. The whole thing takes about five minutes.

> Important: there is no invitation email. Your manager's invitation appears inside the app, on your dashboard, after you log in. Follow the steps below in order and it will be waiting for you.

## Step 1: Create your account

Before your manager can invite you, you need your own CleanRoute Pro account.

1. Open the CleanRoute Pro website your manager gave you.

2. On the sign-in page, press the **Create one** link under the sign-in form.

3. Enter your email address. Use the SAME email address your manager has on file for you — if the two do not match exactly, the invitation cannot reach you.

4. Choose a password (at least 6 characters) and type it again to confirm.

5. Press **Create Account**.

> Use your everyday email address, and double-check the spelling. The email you register with must exactly match the email on your company's staff roster.

## Step 2: Stop at the welcome screen

After registering you will land on a screen that says Welcome to CleanRoute Pro, with two buttons: **Create Organisation** and **Join an Organisation**.

- Do NOT press **Create Organisation**. That button is for business owners setting up a brand-new company. You are joining an existing one.

- You can press **Join an Organisation** if you like — it simply shows the email address your manager needs to invite you. Otherwise just stop here.

## Step 3: Tell your manager you have registered

Your manager can only send the invitation after your account exists. If they try too early, the system tells them your account was not found.

1. Message or tell your manager that you have created your CleanRoute Pro account.

2. Confirm with them the exact email address you used.

3. Wait for them to say the invitation has been sent.

## Step 4: Log in and accept the invitation

1. Go back to the website and sign in with your email and password.

2. On your dashboard you will see a card that says You've been invited!, naming your company.

3. Press **Accept Invite**.

That is it — you are in. You will be taken straight to your schedule.

> Remember: the invitation only ever appears here, inside the app. Do not wait for an email — none is sent.

## What you will see: My Schedule

Once you have accepted, CleanRoute Pro shows you the My Schedule view. It has three tabs along the bottom:

- **Today** — your jobs for today, in order. At the top you will see who is driving, a quick count of jobs, your start time, and how many checklists are signed. Below that is your team for the day, then your job cards.

- **Schedule** — the whole week. Use the arrows to move between weeks, and **Jump to this week** to come back. Tap any day to see its full run sheet, then **Back to week** to return.

- **Completed** — every checklist you have submitted, newest first. Press **View** on any entry to look at it again.

On each job card you will find:

- **Navigate** — opens Google Maps with directions to the job address.

- **Checklist** — opens the cleaning checklist for that job. When it is signed off, the button changes to **Done** and the card turns green.

- An info button (the small circled i) that opens the client's details — access notes, contact details and photos, when your admin has added them.

Some days also show a Leave Base card (where and when to meet in the morning) and a Return to Base card, each with their own **Navigate** button. Breaks appear on the run sheet too.

## Using it on your phone

There is no separate app to download. The staff view IS the website, designed for phones.

1. Open your phone's web browser (Safari, Chrome or similar).

2. Go to the same CleanRoute Pro website address.

3. Sign in with your email and password.

You will get the mobile My Schedule view with the Today, Schedule and Completed tabs.

> Tip: bookmark the page or add it to your phone's home screen so it is one tap away each morning.

## Before your roster appears

Two things control what you see in the Schedule tab:

- Your admin must PUBLISH the week. Until they do, the week simply shows No jobs on every day — this is normal, not an error.

- Each day shows only the jobs assigned to you. Teammates on other runs will see different jobs.

## Troubleshooting

### No invitation appears on my dashboard

- Your manager may not have sent it yet — check with them first.

- The email addresses may not match. The address you registered with must be exactly the same as the one on the staff roster. If you registered with a different address, tell your manager so they can update the roster email and send the invitation again.

### The invitation shows an error when I press Accept Invite

- If it says the invitation is no longer valid or no longer available, it was withdrawn or your roster entry changed after it was sent. Ask your administrator to send a fresh invitation.

### My Schedule tab says No jobs on every day

- The week probably has not been published yet. Only published weeks are visible to staff — ask your admin.

- If the week is published, you may simply not be rostered on those days, since you only see jobs assigned to you.

### The Today tab says No jobs today

- You have nothing rostered today. Press **View Schedule** to check the rest of the week.

### I forgot my password

- On the sign-in page, press **Forgot password?** and follow the prompts.

### I pressed Create Organisation by mistake

- Pressing it only opens a setup wizard — nothing is created unless you finish every step. Press Cancel to go back to the welcome screen. If you did complete the wizard, don't worry: your manager's invitation still reaches you as a notification bell at the top of your dashboard — accept it there and you'll be switched into the company's organisation.
`,
  },
  {
    id: "org-setup",
    title: "Organisation Settings",
    category: "Getting Started",
    description: "Set your business name, timezone, fuel and mileage defaults, payroll cycle and subscription — and find the settings that live elsewhere.",
    audience: "admin",
    content: `
The Organisation Settings page is where you manage details that apply to your whole business: your business name, your timezone, default fuel and mileage figures, your payroll cycle and your subscription. Only owners and admins can open this page — staff who try are sent back to the Schedule. Two sections (Scheduling Defaults and Payroll Settings) are visible to the owner only.

## Opening the page

1. Log in and open **Org Settings** from the sidebar.

2. The page heading reads **Organisation Settings**.

## Business Profile

This is your organisation's name as it appears across the app and on invitations.

1. Type the new name into the **Business Name** field.

2. Click **Save Changes**. A green tick with **Saved** confirms it worked.

## Timezone

All dates and times across the app display in your business timezone, no matter where a staff member happens to be when they open the app.

1. Pick your timezone from the **Business Timezone** dropdown.

2. Click **Save Timezone**.

> The page shows your browser's detected timezone underneath the dropdown as a reference. Use it to check you have picked the right one.

## Scheduling Defaults (owner only)

These are the fuel and mileage figures used to estimate travel costs on your routes.

- **Fuel Efficiency** — how many litres your vehicles use per 100 km.

- **Fuel Price** — the price you pay per litre, in dollars.

- **Per-km Allowance** — a flat rate per kilometre, in dollars. Set this to 0 to use the fuel cost calculation instead.

1. Enter your figures.

2. Click **Save Defaults**.

> Warning: saving here updates every existing team, not just new ones. If you have fine-tuned fuel settings on individual teams in the day editor, saving defaults will overwrite them.

## Payroll Settings (owner only)

The **Payroll Cycle Start Day** dropdown sets which day of the week your pay cycle begins on (Sunday through Saturday). Pick the day and click **Save Payroll Cycle**.

## Subscription

This card shows your subscription status (for example active or trialing) and your current plan. Click **Manage Subscription** to open the Stripe Customer Portal in a new tab, where you can update billing details or change your plan.

## Account

A read-only card showing the email address and role of the account you are logged in with.

## Settings that live elsewhere

Not everything is on this page. Day-to-day team settings live in the day editor on the **Schedule** page, on a specific team's tab:

- **Start Base** — the address the team leaves from that day. Use **+ Add Start Base** to set it.

- **Day starts at** — the time input at the top of the day. When a start base is set, the displayed time becomes the calculated departure time from base.

- **Return To** — where the team finishes. Use **Reset to base address** to send them back to the start base.

- Per-team fuel settings — each team has its own fuel card in the day editor with a toggle, fuel efficiency, fuel price and per-km rate. These start from your organisation defaults.

Staff pay rates are also not set here. Each person's **Hourly Rate** is set on the **Staff** page when you add or edit a staff member.

## Troubleshooting

- Changed a setting but nothing happened? Each card saves separately — make sure you clicked the save button on that card and saw the green **Saved** tick.

- You cannot see Scheduling Defaults or Payroll Settings? Those sections only appear for the organisation owner, not admins.

- Times look wrong for a staff member? Check the **Business Timezone** here first — the app shows everyone the business timezone, not their phone's timezone.

- A team's fuel figures changed unexpectedly? Someone saved **Save Defaults** on this page, which pushes the defaults to all existing teams.
`,
  },
  {
    id: "scheduling",
    title: "Creating & Publishing Schedules",
    category: "Daily Operations",
    description: "Build a week of jobs with teams, drag-and-drop clients, travel times and staff, then publish it so your staff can see it.",
    featured: true,
    audience: "admin",
    content: `
The Schedule page is where you plan each week of cleaning work. You build the week by dragging clients onto days, fine-tune each day with travel times, staff and breaks, then press **Publish** to make the week visible to your staff. Until a week is published, staff cannot see it at all.

## Week view and day view

The Schedule page has two views.

- Week view shows Monday to Sunday as columns, one column per day, for the team you have selected.
- Day view opens when you click a day column. It shows that day as an editable route list next to a map.

Use the back arrow at the far left of the header to return from day view to week view. The left and right arrows step one week at a time in week view, or one day at a time in day view. In day view the arrows stop at Monday and Sunday — use the back arrow to change weeks. The **This Week** button jumps you straight back to the current week, and the small calendar icon opens a month overview you can click to jump to any date.

> You can add a short rotation label to a week (for example A1). In week view, click the small tag icon next to the week dates and type the label. It saves automatically and is shown to staff too.

## Teams

Teams appear as coloured tabs under the header.

- Click a tab to switch teams. The **All** tab shows every team's jobs together in week view.
- Double-click a team name to rename it. Click the coloured dot to pick a new colour.
- Team names and colours are saved per week, so this week's Team 1 can be renamed without changing other weeks.
- Click **Add Team** to add another team to the week.
- To remove a team, select its tab and click the small x on the tab. A confirmation dialog warns you how many scheduled jobs will be deleted — deleting a team removes it and all its jobs for the entire week, and this cannot be undone.

If a week is completely empty you will see **Start Planning This Week** and **Load Template** buttons instead of the calendar.

## Adding jobs

There are two ways to put a client on the schedule.

1. In week view, use the **Client Roster** sidebar on the left. Search for a client and drag their card onto a day column. The job is created with the client's default duration and staff count, and their default checklist is attached automatically.
2. In day view, scroll to the bottom of the route list and click **Add Client**. Search your client database and click a client to add them to the end of the day.

You can also drag a job card from one day to another in week view, or drag it onto the **Drop here to remove** zone at the bottom of the screen to delete it.

> Dragging from the sidebar only works when a specific team tab is selected — it is disabled on the **All** tab, because the app needs to know which team the job belongs to.

## Job cards in day view

Each job card in day view gives you full control of that visit.

- Use the small up and down arrows to reorder jobs.
- The duration box shows hours — type a new value to change how long the job takes.
- A staff badge (for example 2x) shows when the job needs more than one cleaner. When the team has two or more staff for the day, an effective time badge shows the job duration split between them.
- Click the clock icon to pin a fixed start time. A **Pin start time** field appears — the schedule will hold this job at that time, and a pin marker shows next to its times. Click **Clear** to unpin.
- Click the padlock icon to lock the job's position. Locked jobs stay where they are when you optimise the route.
- The swap icon lets you replace this job with a different client from your database without rebuilding the card.
- The checklist icon shows a green dot when a checklist is attached and an amber dot when it is not.
- The paper-plane icon opens the address in Google Maps, and the x removes the job.

## Travel times, bases and start time

CleanRoute Pro calculates real drive times between stops using Google Maps.

- The **Start Base** card at the top of the day sets where the team leaves from. Remove it with the x if the day should simply start at the first client, or click **+ Add Start Base** to bring it back.
- The **Day starts at** card sets the day's start time. When the team needs to leave base earlier or later to reach the first job, the calculated departure time is shown here highlighted and bold.
- Travel segments appear between job cards showing the drive time for each leg, and each job's start and end times are worked out from the day start plus travel and job durations.
- The **Return To** card at the bottom sets where the day ends. It defaults to the base address, can be changed to any address, or removed entirely with the x so the day ends at the last client. Use **Add return destination** to bring it back.
- With two or more jobs, click **Optimize Route Order** to reorder the unlocked jobs into the fastest driving order.

> Week view shows approximate times that stack jobs back to back without travel. Open the day to let Google Maps calculate the real drive times — the accurate times are then saved.

## Breaks

Hover between two job cards and click **Add Break**. A break starts as a 30 minute Lunch Break — rename it, and use the plus and minus buttons to adjust the length in 5 minute steps. Breaks appear in the schedule and exports but are excluded from payable time.

## Staff and drivers

Staff are assigned per team, per day, and apply to all of that team's jobs that day.

1. In day view, open the **Team Staff** card and click **Assign team staff…**.
2. Search and click staff to add them. Staff already on another team at overlapping times appear greyed out under Unavailable — Schedule Conflict, and staff not working that weekday appear under Not Available Today.
3. Once staff are assigned, choose a **Driver** from the dropdown. The driver is shown on rosters and drives the kilometres counted in the summary.

In week view, each day column shows a small people badge — hover it to see who is on each team that day, including the driver. A warning triangle on a day means something needs attention, such as no staff assigned or overlapping times — click it to read the details.

## The Daily Summary

At the bottom of a day's route list, the Daily Summary shows the numbers for the selected team: Job Total, Per Staff (the job time split between the team), Travel, any Break time, Job Split + Travel (the payable time per person), Driver Km and the client count. The owner also sees wages, fuel cost, kilometre allowance, revenue, total costs and profit — admins do not see financial figures. The Day Range at the bottom shows the true start and finish, including the drive back.

Your edits in day view save automatically — watch for the Saving and Saved indicators next to the date, and use the floating **Save** button if you want to force a save.

## Publishing the week

Publishing is what makes a week visible to staff. Staff can only ever see published weeks.

1. Finish building the week, then in week view click **Publish**. The button is disabled until the week has at least one job.
2. Every day of the week is marked published (a green dot appears on each day header) and a snapshot of the schedule is stored for staff.
3. The button changes to a green **Published** badge. Clicking **Published** again unpublishes the week and hides it from staff.

If you edit a week after publishing it, an amber banner appears: changes made to this week are not published. Staff keep seeing the previously published version until you act. Click **Re-publish** to push your changes to staff, or **Revert** to throw away your edits and restore the published version (Revert asks for confirmation and cannot be undone).

The small clock button next to Publish opens **Published Weeks** — a list of every published week with its job count. From there you can jump to a week to edit it, or unpublish it with the bin icon.

> The bin icon in the toolbar is different — it clears every job from every team for the whole week, after a confirmation. This cannot be undone, so use it carefully.

## Troubleshooting

- Staff say they cannot see the schedule. Check the week is published — look for the green **Published** badge in week view. If you see **Re-publish** in amber, your latest changes have not gone out yet.
- You cannot drag a client onto a day. Make sure a specific team tab is selected — dragging is disabled on the **All** tab.
- Times in week view look squashed together. Week view estimates times without travel. Open the day so drive times calculate, then go back.
- **Publish** is greyed out. The week has no jobs yet — add at least one job first.
- The back or forward arrow does nothing in day view. You are at Monday or Sunday — day arrows stay inside the current week. Go back to week view to change weeks.
- A red Save failed indicator appears in day view. Check your internet connection, then click the floating **Save Failed — Tap to Retry** button.
`,
  },
  {
    id: "templates",
    title: "Working with Templates",
    category: "Daily Operations",
    description: "Save a whole week as a reusable template, load it into any future week, and manage templates and rotation labels.",
    audience: "admin",
    content: `
If your schedule repeats — the same clients on the same days, week after week or on a rotation — templates save you rebuilding it every time. A schedule template stores an entire week: which teams work which days, every job with its duration and pinned times, base and return addresses, day start times, breaks, staff rosters and drivers. You can then load that template into any week with a couple of clicks.

## Saving the current week as a template

1. Open the Schedule page and go to the week you want to save, in week view.
2. Click the save icon in the toolbar (Save week as template).
3. In the **Save Week Template** window, type a Template Name — for example Standard Week. For rotation schedules, use the quick-fill chips (A1, A2, A3, A4, B1, B2, B3, B4) to name the template in one click.
4. Check the Week Preview, which lists each day with the teams and job counts that will be saved.
5. Click **Save Week Template**.

The button is disabled if the name is empty or the week has no jobs.

## Loading a template into a week

1. Go to the week you want to fill, in week view.
2. Click the upload icon in the toolbar (Load week template). On an empty week you can also click the **Load Template** button in the middle of the screen.
3. In the **Load Week Template** window, each template card shows its total jobs and a pill for each day (for example Mon: 6). Click **Load Week** on the template you want.

> Loading a template replaces the entire week. Everything currently scheduled in that week — across all teams — is deleted first and cannot be recovered. Load templates into empty weeks, or only when you are happy to overwrite.

After loading, a badge in the toolbar reads Loaded from followed by the template name, so you can see where the week came from. Remember the loaded week is not visible to staff until you click **Publish**.

## How templates match your teams

When a template loads, each team saved in the template is matched to your current teams — first by the original team, then by name. If a template team no longer exists, a new team is created with the saved name. Each team's saved day start time and base and return addresses are applied to the week as well.

Staff and drivers saved in the template are restored too. If someone in the template has since been removed from your organisation, they are skipped and a message appears telling you how many former staff assignments were removed — open those days and assign current staff instead.

## The Templates page

The Templates page (in the sidebar) lists your saved schedule templates under the **Schedule Templates** tab. Each card shows the job and team counts, day pills, and the created date, with three actions.

- **Edit** opens the template editor, where you can change a template without touching any real week. The editor works just like the Schedule page — team tabs, week and day views, dragging clients from the roster — but on a generic Monday-to-Sunday week with no dates. The day editor shows a Template Mode badge, and nothing saves automatically: type the template name at the top and click **Save** when you are done.
- **Load** takes you to the Schedule page. To actually fill a week, use the Load week template button there as described above.
- The bin icon deletes the template after a confirmation.

Click **New Schedule Template** to build a template from scratch in the editor.

## Rotation labels on weeks

Separately from template names, each real week can carry its own short rotation label — click the small tag icon next to the week dates in week view and type something like A1. Use this to mark which rotation a given week is running. The label saves as you type, is shown to staff, and is independent of which template you loaded.

## Troubleshooting

- **Save Week Template** is disabled. Either the name is empty or the week has no jobs — templates cannot be saved from an empty week.
- I loaded a template and my existing jobs disappeared. That is how loading works: it clears the whole week first, and there is no undo. Rebuild the week or load the correct template.
- A message said former staff assignments were removed. Someone saved in the template is no longer an active staff member. Open the affected days and use the **Team Staff** card to assign current staff.
- A template loaded with an unexpected extra team. The template's team could not be matched to an existing team by name, so a new one was created. Rename or remove teams as needed, then re-save the template so it matches next time.
- Staff cannot see the week I just loaded. Loading does not publish. Click **Publish** in week view to make it visible.
- Clicking **Load** on the Templates page did not fill my week. Use the Schedule page: go to the target week, click the Load week template icon, then **Load Week** on the template.
`,
  },
  {
    id: "clients",
    title: "Managing Clients",
    category: "Daily Operations",
    description: "Create client profiles, set rates and access notes, and connect clients to your schedule and checklists.",
    audience: "admin",
    content: `
Clients are the foundation of everything you schedule in CleanRoute Pro. Each client profile holds the address used for route calculations, the hourly rate you charge, contact details, access notes for your cleaners, and the checklists your staff complete on site. This guide covers creating, editing and deleting clients, and how a client flows through to the schedule.

## Where clients live

Open the **Clients** page from the dashboard sidebar. The left panel lists every client with a search box at the top. Click a client's name to open their profile on the right. Click the small arrow next to a client to expand their checklists.

## Creating a client

1. On the **Clients** page, click **New Client** at the top of the left panel.

2. Enter the **Client Name**.

3. Enter the **Address** and pick a suggestion from the search. The address drives route and travel calculations, so include the suburb and postcode.

4. Enter the **Hourly Rate ($/hr)** — the rate you charge this client.

5. Click **Create Client**. Until all three fields are filled, the button reads **Fill in all required fields to continue** and stays disabled.

> New clients start with a default job duration of 1:30 hours. You can change this on their profile at any time.

## The client profile

Everything on the profile saves automatically as you edit — there is no separate save button.

- Colour: click the client's avatar (the coloured square with their initial) to open the colour picker. The colour appears on the client's avatar and their jobs on the schedule, making them easy to spot. Choose **Remove colour** to go back to the default.

- Name: type directly in the name box.

- Address: search and select a new address in the Address card. It is used for route calculations, so keep it accurate.

- Contact rows: click **Phone**, **Email**, **Duration** or **Rate** to edit them in place. Press Enter to save or Escape to cancel.

> Add the client's email address. When staff finish a checklist, the **Email report to client** button addresses the report to this email. Without an email saved, the button does not appear at all.

- Duration: entered as hours and minutes (for example 2:30). This becomes the job length whenever you drop the client onto the schedule.

- There is no staff-count field on the profile. You assign staff to each job on the schedule itself.

## Access and Notes

The **Access & Notes** card is where you record alarm codes, key locations, gate codes, pets and access instructions. It is marked **Visible to staff** for a reason:

- Staff can open the client's info from their job on the mobile view and read these notes on site.

- The notes fill the **Access & Notes** column on roster exports, so printed rosters carry the same instructions.

> Keep these notes current — they are what your cleaners rely on at the front door.

## Photos and videos

Use **+ Upload** on the Photos and Videos card to add reference photos or videos of the property. Staff can view these alongside the access notes. Click the cross on any item to remove it.

## Deleting a client

1. Scroll to the bottom of the profile and click **Delete this client**.

2. A confirmation appears: deleting permanently removes the client and all their data, including checklists and media.

3. Click **Delete client** to confirm.

> There is no archive option for clients — deletion is permanent and cannot be undone. If you might work with the client again, keep the profile and simply stop scheduling them.

## How clients connect to the schedule

On the Schedule page, drag a client from the client sidebar onto a day to create a job. The job automatically copies the client's name, address, default duration and colour, and attaches the client's default checklist.

> You need a specific team selected to drop a client — you cannot drop clients while viewing All Teams.

## How clients connect to checklists

Each client's checklists sit under their name in the left panel of the **Clients** page.

1. Expand the client and click **New checklist** to build one. The first checklist you create for a client becomes their default automatically.

2. Hover over any other checklist and click **Set default** to change which one is attached when the client is scheduled. The current default shows a **Default** badge.

3. Double-click a checklist name to rename it.

4. Open a checklist and use **Save as Template** to keep a reusable copy you can apply to other clients.

## Troubleshooting

- The create button will not activate: all three fields — name, address and hourly rate — must be filled before **Create Client** becomes available.

- A client is missing from the list: the search box matches client names only. Clear the search to see everyone.

- Staff say there is no **Email report to client** button after submitting: the client has no email address saved. Add it on the client's profile — the button appears next time the checklist is opened.

- You cannot drop a client onto a day: you are in the All Teams view. Select a specific team first.

- A photo fails to upload: an error message explains why. Check your connection and try again with a smaller file.

- Staff can see rates: they cannot. Rates are hidden from staff wherever client details are shown.
`,
  },
  {
    id: "roster-exports",
    title: "Exporting Rosters (XLSX)",
    category: "Daily Operations",
    description: "Download a styled Excel roster for a single day or a whole week, for all teams or one team, ready to print or send.",
    audience: "admin",
    content: `
You can download the schedule as a styled Excel (XLSX) roster — a clean run sheet with each team's stops, times and access notes, plus a summary. There are two exports: one for a single day and one for the whole week, and each can cover all teams or just one team.

## Exporting today's roster (day view)

1. Open the Schedule page and click into the day you want, so you are in day view.
2. Click **Export Today's Roster** in the header. The button only appears when at least one team has jobs that day.
3. Choose **Export for all teams**, or pick a single team from the list — only teams with jobs that day are offered.

The file downloads through your browser, named staff-roster followed by the team name (when you picked one), the day name and the date — for example staff-roster-Monday-2026-08-03.xlsx.

## Exporting the week's roster (week view)

1. Go to week view for the week you want.
2. Click **Export This Week's Roster** in the header. It appears when any team has jobs somewhere in the week.
3. Choose **Export for all teams** or a single team.

The week export is one worksheet with every day stacked top to bottom, Monday through Sunday, each day under its own bold date heading. Days with no scheduled jobs are skipped. Everything is on a single sheet on purpose, so nothing is hidden in tabs that are easy to miss. The file is named with the date range — for example staff-roster-all-teams-2026-08-03-to-2026-08-09.xlsx.

The week export reads the saved schedule directly from the database, so it reflects exactly what has been saved for every team and day, even ones you have not opened this session.

## What is in the roster

For each day, every team with jobs gets its own section headed by a row in the team's colour. The columns are:

- A row number for each stop.
- Client — the client's name. A Base row at the top shows where the team leaves from, with the departure time, and a Return to Base row at the bottom shows the trip back with leave and arrive times.
- Address — with the state, postcode and country trimmed off to keep it short.
- Start Time and End Time — in 12-hour format, for example 8:00 AM and 10:30 AM.
- Total Duration — the time at that stop shown as hours and minutes, already split between the team. A 3 hour job done by a 2-person team shows as 1:30.
- Access & Notes — taken from the Notes field on the client's profile. This is where gate codes, alarm instructions and key locations should live.

Breaks appear as their own amber rows with their times and length. Below each team's stops is a Summary block: the team's staff names, the Driver, Total Clients, Total Job Time, Team Split (job time per person), Travel and Driver Km. If the week has a template code saved, it appears above the date heading.

> The Daily Summary card inside day view also has its own smaller per-team export. The roster exports described here are the ones designed for handing to staff — they cover all teams and carry the access notes.

## When to re-export

An export is a snapshot of the moment you clicked the button — it never updates itself. Export again whenever you have:

- added, removed or reordered jobs,
- changed staff, the driver, durations or pinned times,
- changed a base or return address, or
- loaded a template into the week.

## Troubleshooting

- The export button is missing. Check the view: **Export Today's Roster** only shows in day view, and **Export This Week's Roster** only shows in week view. Both need at least one job to exist.
- A team is missing from the file. Teams with no jobs that day are left out, and in the week export whole days without jobs are skipped. That is by design.
- Start and end times are blank or look wrong. Times are calculated with real drive times when you open a day. Open the affected day in day view, let it finish loading so travel calculates and saves, then export again.
- The Access & Notes column is empty. It comes from the Notes field on each client's profile. Open the client in the Clients page, add their access details to Notes, then re-export.
- The roster shows old information. You are looking at an earlier download. Export a fresh copy — files do not update after changes.
- I cannot find the downloaded file. It goes wherever your browser saves downloads — usually the Downloads folder. Check your browser's download list.
`,
  },
  {
    id: "checklist-workflow",
    title: "The Checklist Workflow: Site to Client",
    category: "Checklists",
    description: "Follow a checklist from assigning it to a client, through staff filling it in on-site, to emailing the finished report to the client.",
    featured: true,
    audience: "all",
    content: `
This guide follows one checklist through its whole journey: an admin attaches it to a client, staff fill it in on their phone during the clean, and the finished report is emailed to the client. Nothing in this flow happens by magic in the background — every step below is a real button someone presses, so you always know exactly where a report is up to.

## Step 1: Set the client's default checklist (admin)

1. Open **Clients** in the sidebar.

2. Click the small arrow next to the client's name to expand their list of checklists.

3. Hover over the checklist you want and press **Set default**. A **Default** badge appears next to it.

- A client can have several checklists, but only one default. Setting a new default automatically un-sets the old one.

- From now on, every new job you add for this client on the Schedule page — whether you drag them onto a day or use **Add Client** — automatically has the default checklist attached.

- Jobs already sitting on the schedule keep the checklist they were created with.

> Staff can only see a week after you press **Publish** on the Schedule page. Until then the jobs, and their checklists, are invisible to them.

## Step 2: Fill it in on-site (staff)

There is no separate staff app — staff log in to the same website on their phone's browser and land on **My Schedule**.

1. Find today's job and tap **Checklist** on the job card. The button only shows when the job has a checklist attached.

2. Work through the questions. Depending on how the checklist was built you will see tick boxes, **Yes** and **No** buttons, option lists, dropdowns, text boxes, date and time pickers, and photo or video fields.

3. Photo fields say **Tap to take photo or upload image** — use the camera on the spot or pick from your camera roll. Video fields work the same way for recordings.

4. If a question doesn't apply today, tap **N/A** on that question. It counts as answered.

5. Add anything unusual in **Additional notes** at the bottom — your admin reads these.

The bar at the top shows your progress, for example 7 of 12 completed. A few things happen automatically while you work:

- Every answer saves the moment you tap it — you'll see **Saving…** flash in the header. Typed text saves a moment after you stop typing.

- Your progress survives closing the browser, losing signal or a flat battery. Reopen the checklist and everything is still there.

- Several cleaners can fill in the same checklist at once. Each person gets their own colour, answers appear on everyone's phones as they happen, and the coloured dot on each question shows who answered it. The coloured circles in the header show you plus everyone who has answered at least one question so far.

## Step 3: Submit (staff)

1. When you're done, press **Submit Checklist** at the bottom. If some questions are still open, the button shows the count instead, for example **Submit (10/12)**.

2. Required questions are marked with a red star. If any are unanswered you'll see "Please complete all required fields before submitting." and the form jumps to the first one. Answer it or mark it **N/A**.

3. After submitting you'll see the **All done!** screen. The checklist is now locked — reopening it shows this screen, not the form.

## Step 4: Email the report to the client (staff)

On the **All done!** screen, press **Email report to client**. Your phone opens its own email app with a draft already written for you: it is addressed to the client's email address, the subject line has the checklist name, client and date, and the body lists every question with its answer plus your notes. Check it over, then press send in your email app.

> CleanRoute Pro never sends emails by itself. The report leaves from the staff member's own email account, and only when they press send. If nobody presses the button, no email goes anywhere.

- Want management to get a copy? Add the office address in the CC field of the email before you press send.

- An admin can send the report too — open the submitted checklist through **Staff View** and press the same button.

## Watching it happen live (admin)

You don't have to wait for the email. The **Completed** page shows every published job for the week with its checklist status — **Done**, a live percentage, or **Not started**. Click a job to open its checklist panel and you'll see answers, photos and notes appear in real time as staff tap them in on-site, a colour legend under **Filled in by** showing exactly who answered what, and the submitted time once it's in. See "Reviewing Completed Checklists" for the full tour.

## Daily routine

A rhythm that works well at the end of each day:

1. Staff: submit the checklist before you drive off, while you're still at the site, then press **Email report to client** and send it. Details are freshest in the carpark, not at home.

2. Admin: open **Completed** and check today's column — every job should show **Done**.

3. Open anything still showing a percentage. The **Filled in by** pills and the "Waiting on" names tell you who to call.

4. Read the **Staff Notes** on each submitted job — broken gear, access problems and client requests land there.

5. Spot-check a few photos while any problem is still fresh enough to fix.

## Troubleshooting

- The **Email report to client** button doesn't appear. It only shows when the client has an email address saved. Open **Clients**, select the client, add their email address to the profile, then reopen the checklist.

- The client says the report never arrived. It sends from the staff member's personal email app, not from the platform. Ask them to check the Sent folder in their email app — if it isn't there, the draft was never sent. Also double-check the client's email address on their profile.

- The checklist shows old answers after you switched the client to a different checklist. Progress is stored per job, so leftovers from the old checklist can hang around. Open the job on the **Completed** page and press **Reset progress** — after you confirm, the checklist goes back to blank for everyone. This permanently deletes the old answers, photos and notes.

- Staff see no **Checklist** button at all. The button only appears when the job itself has a checklist attached. Newly scheduled jobs pick up the client's default checklist automatically, but older jobs may not have one — open the job in the scheduler, attach a checklist from the job card, then press **Re-publish** so staff get the update.
`,
  },
  {
    id: "checklist-building",
    title: "Building Checklists",
    category: "Checklists",
    description: "Create per-client checklists, add fields and conditional logic, save reusable templates, and assign checklists to jobs.",
    audience: "admin",
    content: `
Checklists are the forms your cleaners fill in on their phones while they work. Every checklist belongs to a client, so you build them on the **Clients** page. This guide covers creating and editing checklists, the field types you can use, required fields and N/A, conditional logic, reusable templates, and how to choose which checklist a particular job uses.

## Where checklists live

Open **Clients** in the sidebar. On the left you will see your client list. Click the small arrow next to a client to expand them and see their checklists. Each client can have any number of checklists, and one of them is the default — marked with a **Default** badge.

## Create a checklist

1. On the **Clients** page, expand the client in the left-hand list.

2. Click **New checklist** under that client.

3. Build your checklist in the editor on the right (see below), then click **Save**.

4. The checklist is saved as Untitled. Double-click its name in the left-hand list to rename it — press Enter to keep the new name or Escape to cancel.

> The first checklist you create for a client automatically becomes that client's default.

## Adding blocks

The builder works like a simple document. Click the line that says **Type / to insert a block…** at the bottom.

- Type text and press Enter to add a plain text block.

- Type / to open the block menu, then keep typing to filter it. Use the arrow keys and Enter, or click, to pick a block type.

- Hover over any block to reveal its controls on the left: a drag handle to reorder, a three-dot **Field settings** button, a plus to insert a block below, and a bin to delete it.

- Click a block's type icon to change it to a different type.

## Block types

- **Text** — body text for staff to read (instructions, reminders).

- **Checkbox** — a single tick to mark something complete.

- **Checkbox List** — tick one or more items from a list you define.

- **Yes / No** — a yes or no answer.

- **Response** — an open-ended text answer.

- **Photo / Image** — staff upload a photo.

- **Video** — staff record or upload a video.

- **Date** and **Time** — date and time pickers.

- **Dropdown** — a single choice from a list of options.

- **Multi-select** — pick multiple options from a dropdown.

- **Heading** — a section title divider to organise the form.

- **Logic** — shows or hides other blocks based on answers (see below).

For **Dropdown**, **Checkbox List** and **Multi-select** blocks, the options appear directly under the block. Press Enter after an option to add the next one, or click **Add option**.

## Field settings

Hover over a block and click the three-dot **Field settings** button to open its settings:

- **Helper text** — a hint shown to staff below the field.

- **Required** — staff must answer this field before submitting. Required fields show a small REQ badge in the builder.

- **Allow N/A** — lets staff mark the field as not applicable instead of answering it.

> If the checklist contains a Yes / No block, the settings also offer a quick **Only show when** option tied to that question. For anything more flexible, use a Logic block instead.

## Conditional logic with Logic blocks

A **Logic** block shows or hides other blocks based on answers. Insert one from the block menu — it appears as a purple panel.

1. Under If, choose the field to watch, an operator, and a value. The operators depend on the field: a Yes / No field uses is, a Response field offers is answered, is empty and contains; Dropdown and Checkbox List fields offer is, is not and includes; a Multi-select field offers is answered and is empty.

2. Click **+ Add condition** to add more conditions. Click the small AND or OR word between conditions to switch how they combine.

3. Under Then, choose **Show** or **Hide**, then click the blocks it should affect. Selected blocks turn purple.

Example: add a Yes / No block called Damage found and a Response block called Describe damage. Then add a Logic block: If Damage found is **Yes**, Then **Show** Describe damage. Staff will only see the Describe damage field if they answer Yes.

> Blocks targeted by a Show action are hidden by default and only appear when the conditions are met.

## Saving

Click **Save** at the bottom of the builder. If any answerable block is missing a title, the builder shows a warning and disables **Save** until you add titles. Headings, text blocks and logic blocks do not need titles.

## The default checklist

When a job has no specific checklist assigned, staff see the client's default checklist. To change the default, hover over a checklist in the left-hand list and click **Set default**. The **Default** badge moves to that checklist — each client only ever has one default.

## Reusable templates

To reuse a checklist across many clients, save it as a master template:

1. Open a saved checklist on the **Clients** page and click **Save as Template** in the header. You will see a brief Saved! confirmation.

2. Templates are managed on the **Templates** page, under the **Checklist Templates** tab. You can also build one from scratch there with **New Checklist Template**, and use the **Preview** button to see it exactly as staff will.

3. To load a template onto clients, open it and click **Assign to Clients**. Tick the clients you want and confirm. Each client gets their own copy, which becomes their default if they had none.

> Assigning creates independent copies. Editing the template later does not change clients automatically — run **Assign to Clients** again to push the update to clients who already have a copy from that template.

You can also **Duplicate** or **Delete** a template from the list — hover over it to see the buttons.

## Choosing a checklist for a single job

By default a job uses the client's default checklist. To use a different one for a specific job:

1. On the scheduler, find the job card and click its clipboard icon. An amber dot means no checklist is assigned yet; a green dot means one is.

2. In the **Select checklist for this job** menu, click the checklist you want. The client's default is tagged default in the list.

3. You can also click **Add new checklist for this client** to create a blank checklist, name it, and assign it on the spot. Build its contents later on the **Clients** page.

The job card shows a green pill with the assigned checklist's name, or an amber No checklist assigned pill if there is none.

> If a client only has one checklist, clicking the clipboard icon assigns it automatically.

## Troubleshooting

- The **Save** button is greyed out. One or more blocks are missing a title — a red bar at the bottom tells you how many. Give every answerable block a title.

- Staff see the wrong checklist on a job. Check the job card's clipboard picker on the scheduler — a checklist assigned there overrides the client's default. Also confirm the right checklist has the **Default** badge on the Clients page.

- Staff see no checklist at all. The client has no default checklist and none is assigned to the job. Create one, or hover over an existing checklist and click **Set default**.

- The block menu did not open when I typed /. The slash only triggers as the first character on an empty line. Clear the line first, then type /.

- A Logic block is not doing anything. It needs at least one complete condition and at least one target block selected under Then.

- I edited a template but my clients did not change. Templates copy their content when assigned. Open the template and use **Assign to Clients** again to update clients whose checklist came from that template.

- I cannot see **Set default**. It only appears when you hover over a checklist that is not already the default — the current default shows the **Default** badge instead.
`,
  },
  {
    id: "checklist-review",
    title: "Reviewing Completed Checklists",
    category: "Checklists",
    description: "How to use the Completed page to watch checklists live, review photos and notes, and reset progress when needed.",
    audience: "admin",
    content: `
The **Completed** page is your control room for checklists. It shows every published job for a week, how far its checklist has come, who is filling it in, and every answer, photo and note — all updating live while your teams are still on-site.

## Finding your way around

- Open **Completed** in the sidebar. The header reads **Completed Jobs** with the week's date range underneath.

- Only published weeks appear here. Use the left arrow to step to older weeks and the right arrow to come back towards the newest; the counter between them, such as **1 / 4**, shows where you are. You always land on the most recent published week.

- If you see "No published weeks yet", nothing has been published — press **Publish** on the Schedule page first.

- The circular arrow button in the header reloads everything on demand.

- Two badges in the header summarise the week: a green one such as **8/10 submitted** and, when relevant, a blue one such as **2 in progress**.

## The week grid

- On a computer the week is seven columns, Monday to Sunday, with today's header highlighted. Each day's header shows that day's count, such as 3/4.

- Every card is one job: a coloured stripe and team name for the team, small circles with the initials of the assigned staff, and a status badge — a green **✓ Done**, a blue percentage such as **60% done** while staff are mid-clean, or **Not started**.

- On a phone the same jobs appear as a vertical list grouped by day; days without jobs are hidden.

- Breaks never appear here, and only jobs linked to a client are listed.

## Opening a job's checklist

Click any job card and a panel slides in from the right. At the top you'll see:

- A progress ring — green when submitted, blue while in progress, grey when untouched — next to **Submitted**, **In Progress** or **Not Started**, and a count such as 9/12 fields.

- **Assigned Team** — who was rostered onto the job.

- **Filled in by** — coloured name pills for everyone who actually answered something. These colours are the key to reading the rest of the panel.

- While the checklist is underway, a pulsing green dot with **Live — updating in real time**.

## Live updates

You are watching the actual checklist, not a copy. As staff tap answers on-site they appear in the panel within moments, the progress ring climbs, and the card badges on the grid update too. When staff press submit, the card flips to **✓ Done** on its own. You never need to reload the page, though the refresh button is there if something looks stuck.

## Reading the answers

- Ticked boxes and selected options are filled in the colour of whoever answered them.

- Yes and No questions show a green **✓ Yes** or red **✗ No** pill.

- Text, date and time answers appear under their question. Unanswered questions are greyed out with "Not answered".

- Questions marked not applicable carry an **N/A** badge.

- Each answered question has a coloured edge and a small circle with the staff member's initial — match it against the **Filled in by** pills to see exactly who did what.

## Photos, videos and notes

- Photos appear as thumbnails — click one to view it full screen.

- Videos appear as **View video** buttons that play the clip in a pop-up viewer.

- A photo or video question with nothing uploaded reads "No media uploaded".

- Anything staff typed into their notes box shows in the amber **Staff Notes** panel near the bottom.

- A submitted checklist ends with a green stamp showing exactly when it was submitted, for example Submitted Tue 4 Aug, 3:42 pm.

## Reset progress

**Reset progress** sits near the top of the panel whenever the job has any recorded progress.

1. Press **Reset progress**.

2. A confirmation dialog appears: "Reset checklist progress?" It spells out that this permanently deletes every answer, photo and note staff have recorded for the job, and that it cannot be undone.

3. Press **Yes, reset progress** to go ahead, or **Cancel** to back out.

Use it when the wrong checklist was filled in, when clearing a test run, or when old answers linger after you switched the client to a different checklist.

> Reset is permanent. The record is deleted, not archived — if you might need the answers later, don't reset. The checklist goes back to blank for everyone, including staff mid-shift.

## When a job has no checklist of its own

If a job was never given a specific checklist, the panel falls back to showing the client's default checklist so you can still review answers. If the client has no default either, the panel reads "No checklist assigned" and suggests assigning one in the scheduler. A job whose checklist exists but has never been opened shows "No checklist submitted yet", along with "Waiting on:" and the names of the assigned staff.

## Troubleshooting

- A week you expect is missing from the arrows. Only weeks with at least one published day appear. Publish the week from the Schedule page and it will show up.

- A job is missing from a day. Only published, non-break jobs linked to a client are shown. If the job was added after the week was published, press **Re-publish** on the Schedule page.

- Counts or cards look stale. Press the circular refresh button in the header — live updates can occasionally miss a beat on a flaky connection.

- Answers show as "Not answered" even though staff filled the job in. This usually means the client's checklist was changed after staff started — the recorded answers belong to the old questions. Press **Reset progress** and have staff redo it on the current checklist.
`,
  },
  {
    id: "invites-and-access",
    title: "Accounts, Permissions & Access Control",
    category: "Staff & Access",
    description: "How roster records and login accounts differ, what each role can see, and how to change roles, revoke access or remove someone.",
    audience: "admin",
    content: `
This guide explains how CleanRoute Pro decides who can log in to your organisation and what they can see. It covers the difference between your roster and login accounts, the Accounts & Access tab, what each role can do, and exactly what happens when you change or revoke someone's access. You need to be an owner or admin to open the Staff page, and several actions here are owner-only.

## Roster versus login accounts

CleanRoute Pro keeps two separate lists, and understanding the difference solves most confusion:

- The roster (the **Roster** tab) is your list of workers: name, email, phone, hourly rate and available days. Roster entries are what you assign to schedules. A person can be on the roster without ever logging in.

- Login accounts (the **Accounts & Access** tab) are real CleanRoute Pro logins connected to your organisation. An account connection only exists once a person registers themselves and accepts your invitation.

Each roster card carries a badge showing how the two are linked:

- **No account** — roster entry only. They have never accepted an invite, or their access was revoked.

- **Invite pending** — an invitation is waiting for them inside the app.

- **Active account** — they have accepted and can log in.

## The Accounts & Access tab

Open **Staff**, then click **Accounts & Access**. The tab shows up to three sections:

- Active — everyone who currently has a login connected to your organisation, including you. Owners carry an Owner badge, admins an Admin badge and supervisors a Supervisor badge.

- Invite pending — invitations sent but not yet accepted, each with a **Resend** button and a cancel (X) button.

- No account — roster staff with no login connection, each with a **Send invite** button.

> The tab's note sums it up: revoking removes portal access but keeps the person in the roster, and admins cannot be removed — only their organisation membership can be revoked.

## What each role can do

CleanRoute Pro has four roles. Here is what each person sees when they log in on a computer:

- Owner — everything: Schedule, Completed, Clients, Templates, Staff, Staff View and Org Settings. The owner created the organisation. Their access cannot be revoked and their role cannot be changed from this page.

- Admin — the same menu as the owner: Schedule, Completed, Clients, Templates, Staff, Staff View and Org Settings. The role picker describes it as management access without financials: schedule editing and publishing, staff management, checklists, completed checklists, client cards without rates, templates, staff dashboard preview and limited settings.

- Supervisor — My Schedule and Published Schedules. Described as a field supervisor or team leader: view published schedules, view client cards, complete checklists and view completed checklists.

- Staff — My Schedule only: their own daily jobs and tasks, and completing checklists.

On a phone, everyone sees the mobile My Schedule view regardless of role — the management pages are desktop only.

Every invitation starts at the staff role. Promote people after they accept.

## Changing someone's role

Only the owner can change roles.

1. Open **Staff**, then **Accounts & Access**.

2. Find the person in the Active section.

3. Click the role button next to their name — it shows their current role, for example **Staff**.

4. A menu opens describing Admin, Supervisor and Staff, listing exactly what each can see. Click the role you want.

The change applies immediately. You cannot change your own role, and the owner's role cannot be changed.

## Revoking access

Revoking removes someone's login access while keeping them on your roster, so you can re-invite them later. Only the owner can revoke access.

1. On the **Accounts & Access** tab, click **Revoke** next to the person.

2. A confirmation dialog appears. Click **Revoke access** to confirm.

You can also revoke from the **Roster** tab: staff with an **Active account** badge show a revoke icon on their card, which opens the same style of confirmation.

What happens to the person:

- They immediately lose access to your organisation's data.

- If they belong to another organisation, their login automatically switches over to that organisation.

- If yours was their only organisation, their next login lands them on the welcome screen (Welcome to CleanRoute Pro), as if they had just registered.

- Their roster record stays and shows **No account**. You can send a fresh invite at any time.

## Cancelling a pending invitation

On the **Accounts & Access** tab, find the person under Invite pending and click the X (Cancel invite), then confirm with **Revoke access**. The invitation disappears from their dashboard and their roster badge returns to **No account**.

## Removing someone completely

Removing deletes the roster record as well as revoking access. Only the owner can do this.

1. On the **Roster** tab, click the bin icon on their card (Remove staff member). The same bin icon also appears next to staff accounts on the **Accounts & Access** tab.

2. In the dialog, click **Remove staff** to confirm.

This permanently deletes their roster entry and their schedule assignments, and cannot be undone. Their personal login is detached from your organisation exactly as with a revoke: they see the welcome screen if they have no other organisation, or they are switched to their other organisation if they have one.

Admin accounts that are not on the roster cannot be removed this way. For them, **Revoke** is the only option — and it is all that is needed, since they have no roster record to delete.

## Troubleshooting

- "Only the owner can change roles", "Only the owner can revoke access" or "Only the owner can remove staff" — These actions are owner-only. Admins can view this page and send invitations, but the owner must make access changes.

- Someone accepted their invite but the roster still shows **Invite pending** — Reload the **Staff** page. It automatically re-checks and repairs out-of-date badges.

- The person says they were removed but can still log in — Their login itself is never deleted from this page; removal disconnects it from your organisation. They will see the welcome screen (or their other organisation) instead of your data. Confirm they no longer appear in the Active section of **Accounts & Access**.

- An invitee reports "This invitation is no longer valid — ask your administrator to re-invite you." — Their roster record was archived or deleted after the invite was sent. Restore or re-add them, then send a new invitation.

- A red Orphaned badge appears in the Active section — A staff record was deleted but the login access was never cleaned up. Click **Revoke** on that row to remove the leftover access.
`,
  },
  {
    id: "payroll",
    title: "Payroll & Spreadsheet Exports",
    category: "Payroll",
    description: "Turn published schedules into staff hours, wages and kilometre allowances, and download a payroll spreadsheet.",
    featured: true,
    audience: "admin",
    content: `
The Payroll page turns your published schedules into hours and wages for each staff member. It splits job time across the team, adds travel time from your saved drive times, excludes breaks, and works out a kilometre allowance for drivers. From there you download a ready-made spreadsheet for your payroll run.

> Payroll only reads published schedules. If a day has not been published, it does not exist as far as payroll is concerned.

## Opening the payroll page

1. Open the **Staff** page from the sidebar.

2. Click **Payroll** in the top right.

> Only the owner login can open the payroll page. Staff and admins are redirected away.

## Selecting a staff member and pay period

1. Choose a person in the **Staff Member** dropdown. Each entry shows their hourly rate.

2. Choose a period in the **Published Week** dropdown. Only weeks that contain published schedules appear. Use the arrows either side to step to older or newer weeks.

If a period shows something like (3/7 days), only some days in that payroll cycle have published schedules. A red warning banner also appears: **Incomplete Payroll Period**. This happens when your payroll cycle starts on a different day to your schedule week, so one pay period spans two schedule weeks. Publish both schedule weeks before exporting, or your totals will be short.

## How hours are calculated

- Job time is split across the team. A 3 hour job done by a team of 2 counts as 1 hour 30 minutes per person. The **Team Total** column shows the full job time; **Job Split** shows this person's share.

- Travel time comes from the drive times saved with the schedule — the same route calculations you see when building the day. If no saved travel exists, payroll falls back to measuring the gaps between jobs on the timeline.

- If the schedule has a base departure time earlier than the first job, the day starts from the departure, so travel from base to the first job is included.

- Breaks appear on the day but are excluded from paid time.

- **Net Work** for a day is Job Split plus Travel.

## Driver kilometre allowance

Some staff drive the team vehicle and are paid per kilometre. Payroll includes this automatically when all of the following are true:

- The team has the **Calculate Fuel** toggle turned on in the day editor.

- The selected staff member is set as the driver for that day.

- The team has a per-kilometre rate above zero. The default for new teams is the **Per-km Allowance** under Scheduling Defaults on the Settings page.

When it applies, a KM Allowance line appears in the Wage Calculation showing the kilometres and dollar amount, and it is added to **Total Payable**.

## Reviewing the day rows

The Daily Breakdown lists all seven days with columns for Day, Jobs, Start, Finish, Team Total, Job Split, Travel and Net Work. Each figure shows hours and minutes with the decimal equivalent underneath. Today is highlighted, and days with no work are greyed out.

Below that, the Weekly Summary totals the week: Job Hours (Team), Job Hours (Split), Total Travel, Net Work Hours and Days Worked. The Wage Calculation shows net hours multiplied by the hourly rate, any KM Allowance, and the **Total Payable**.

> Check the day rows before exporting. If a start time or travel figure looks off, fix the day on the schedule first — the export uses exactly what you see here.

## Downloading the spreadsheet

1. Click **Download XLSX** at the bottom of the page.

2. If the pay period is incomplete, a warning asks you to confirm before continuing.

3. The file downloads named payroll, then the staff member's name and the week-ending date. It opens in Excel or Google Sheets.

The spreadsheet contains, per day, two rows — one in hours and minutes, one in decimal hours for payroll software — under these columns: Day / Date, Team, Start, Finish, Jobs, Job Hours Total (Team), Job Hours (Individual), Travel, Net Work, and KM. Days with no work are skipped. At the bottom, weekly totals list Total Job Hours (Team), Total Job Hours (Individual), Total Travel, Net Work Hours, then Total KM and KM Allowance (only when kilometres were recorded), Gross Wage, and Total Payable when an allowance applies.

> The download is an Excel spreadsheet (an xlsx file), not a plain CSV. The decimal rows are designed for copy-paste straight into payroll software.

## Setting your payroll cycle start day

If you pay Wednesday to Tuesday rather than Monday to Sunday, tell CleanRoute Pro:

1. Open the **Org Settings** page.

2. Under Payroll Settings, choose a day in the **Payroll Cycle Start Day** dropdown.

3. Click **Save Payroll Cycle**.

Payroll periods then run seven days from that day. If your cycle starts mid schedule week, one pay period draws from two schedule weeks — publish both to get complete totals.

## Troubleshooting

- The week dropdown says No published weeks available yet: no schedule week has been published. Publish a week from the schedule and it will appear here.

- A period shows fewer than 7 days published: the cycle spans two schedule weeks and only one is published. Publish the other week.

- Travel looked inflated on an old export: earlier versions could count phantom travel from the team's nominal start time on days with no start base. This has been fixed — travel now anchors to the day's actual departure or first job.

- Times or travel still look wrong: open that day in the schedule editor so it recalculates and saves fresh times, then return to payroll.

- A staff member is missing from the dropdown: archived staff are not listed. Restore them on the Staff page if needed.

- No KM allowance is showing: confirm the team's **Calculate Fuel** toggle is on, the per-kilometre rate is above zero, and the right person is set as the driver for those days.
`,
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting Common Issues",
    category: "Troubleshooting",
    description: "Quick fixes for the most common problems: missing rosters, invitations, checklist emails, stale data, exports and more.",
    featured: true,
    audience: "all",
    content: `
This guide lists the most common problems in CleanRoute Pro, what causes them, and how to fix them. Each section starts with the symptom, so scan the headings for the one that matches yours.

## A staff member cannot see their roster

Staff only see published work that they are actually rostered on. Check these three things in order.

1. The week may not be published. On the **Schedule** page, switch to week view and look at the top-right. If you see a blue **Publish** button, the week is not visible to staff yet — click it. If you see an amber **Re-publish** button, you have made changes since the last publish and staff are still seeing the old version — click **Re-publish**. A green **Published** badge means the week is live.

2. The person may not be assigned. Staff only see a day if they are on that day's team roster, set as the driver, or assigned to a job. Open the day in the day editor and check the team staff picker.

3. Their invitation may not be accepted yet. Until they accept the invite on their dashboard, they are not linked to your organisation and see nothing. See the next section.

> The **Publish** button is greyed out until the week has jobs on it — hover it and it says Add jobs before publishing.

## An invitation is not showing up

CleanRoute Pro does not send invitation emails. The invite appears inside the app: a card saying **You've been invited!** with **Accept Invite** and **Decline** buttons, shown on the person's dashboard the next time they log in.

If the person cannot see the invite card, work through these causes.

1. They have not registered yet. The person must create their own account at the CleanRoute Pro website first. If they have no account, the admin sees an error saying the user was not found and to ask them to create an account first, then invite again.

2. They registered with a different email address. The invite is matched to the exact email the admin typed. Check both sides for typos, and check which address the person actually registered with — it is shown on their welcome screen.

3. The admin has not actually clicked the invite button. On the **Staff** page, the admin must click **Send invite** for that person. A **Invite pending** badge confirms it was created.

4. The person created their own organisation at signup. New staff should stop at the welcome screen — or choose **Join an Organisation** — rather than clicking **Create Organisation**, which sets up a separate business. If they did create one, the invite still reaches them: instead of the full-page card, a notification bell with a red badge appears at the top of their dashboard. Clicking it opens Pending Invitations, where they press **Accept** — this switches them into your organisation.

## The checklist report never reached the client

The app does not email clients itself. When a checklist is finished, the staff member sees an **Email report to client** button. Tapping it opens the staff member's own email app on their phone, with the report already filled in — they still have to press send in their mail app.

- If the client says nothing arrived, check the Sent folder in the staff member's own email app. If it is not there, the email was never sent — open the checklist and use **Email report to client** again.

- If the button does not appear at all, the client has no email address saved. An admin needs to add the client's email on the **Clients** page, and the button will show next time.

## The app shows old information on a phone

Phone browsers keep pages alive in the background, so a staff member can be looking at yesterday's data.

1. Fully close the browser tab (not just switch away from it).

2. Open the website again and log in if asked.

## I cannot drop a client onto a day

You are on the **All Teams** tab. Clients can only be dropped onto a day when a specific team is selected, because the app needs to know which team the job belongs to. Click the team's tab first, then drag the client onto the day.

## An exported roster is empty or missing staff names

This was a bug that has been fixed — export again using **Export Today's Roster** (day view) or **Export This Week's Roster** (week view), then pick **Export for all teams** or a single team.

The export reads the saved schedule from the database, not what is merely on your screen. If you have just made changes, give the autosave a moment (or reopen the day so it saves) before exporting, and make sure the jobs are actually on the week.

## What does Reset progress do?

On the **Completed** page, admins can open any checklist and watch it update live — a green badge reads Live — updating in real time. The **Reset progress** button at the top opens a confirmation asking Reset checklist progress?

> Warning: resetting permanently deletes every answer, photo and note staff have recorded for that job, for everyone. The checklist goes back to blank. This cannot be undone — you must confirm with **Yes, reset progress**.

## Something in the platform itself seems broken

If a page will not load, a button errors repeatedly, or data looks corrupted even after closing and reopening the browser tab:

1. Staff should report it to their admin or business owner first — most problems turn out to be a setup issue an admin can fix.

2. If the admin confirms it is a genuine platform fault, the business owner should contact CleanRoute Pro support through the channel provided with their subscription, including what happened, the page it happened on, and roughly what time.
`,
  },
];
