Manual test checklist — Money OS

## INITIAL SETUP (do these 3 steps first)

**Step 1: Add a paycheck**

- Go to Paychecks tab
- Click "Add Paycheck"
- Fill in:
  - Employer: "Acme Inc"
  - Pay date: May 1, 2026 (or any future date)
  - Take-home: $2000
  - Regular hours: 40
- Save
- _Expect: Paycheck shows in Paychecks list_

**Step 2: Set cash and buffer (optional, to see Safe to spend math)**

- Go to Settings tab
- Set Current cash: $500
- Set Emergency buffer: $200
- Click "Save"

**Step 3: Add a bill template**

- Go to Bills tab
- Click "Add Bill"
- Fill in:
  - Bill name: "Rent"
  - Amount: $1200
  - Due date: May 15, 2026
  - Category: "Housing"
  - Repeat: "monthly"
- Save
- _Expect: Template appears in "Bill Templates" section; 6 months of instances appear in "Bills to Pay" list sorted by due date_

---

## TEST SCENARIOS

### Test 1: Pay a bill instance

- In Bills tab, find the Rent bill (May 15) in "Bills to Pay"
- Click "Pay"
- _Expect: Instance moved to "Payment History", next month's instance created (Rent June 15) and appears in "Bills to Pay"_
- Check Dashboard: "Safe to spend" should decrease by $1200

### Test 2: Edit template

- In Bills tab, under "Bill Templates", click Edit on Rent
- Change Amount to $1300
- Change Due date to May 20
- Save
- _Expect: Future unpaid Rent instances update to new amount $1300 and due dates shift to the 20th_

### Test 3: Pause / unpause template

- Click "Pause" on Rent template
- _Expect: Status shows "Paused"; no new instances generated_
- Click "Unpause"
- Regenerate projection (change to 3 months, click Regenerate)
- _Expect: New instances created for 3 months from today_

### Test 4: Delete template

- Click "Delete" on Rent template, confirm
- _Expect: Template removed; future unpaid instances removed; paid instances stay in history_

### Test 5: Multiple paychecks & bill assignment

- Add a second paycheck on May 8 (before Rent due date of May 15)
- Go to Dashboard
- _Expect: "Reserved for next paycheck" shows Rent is assigned to May 1 paycheck (first paycheck before due date) OR May 8 if May 1 is already past_

### Test 6: Projection control

- In Bills tab, change projection dropdown to "3 months"
- Click "Regenerate"
- _Expect: Instances for only 3 months ahead; old unpaid instances beyond 3 months removed_

---

## Edge Cases to Watch

- **31st due date on Feb**: Should cap at Feb 28/29
- **Zero amount**: Should create instances with $0; pay should not reduce cash
- **Paid instances**: When regenerating, past paid instances should be preserved
- **Paused then unpaused**: Should only create instances for unpaused templates

7. Projection control

- In Bill Templates, change projection to 3/6/12 months and click Regenerate
- Expect: Future unpaid instances replaced to match the selected months

8. Migration

- Import an old backup with simple `bills` entries (if available)
- Reload app: migration should create templates and generate instances

Notes / Debugging

- Use browser console to inspect `state` (localStorage key `moneyos-state-v2`) to validate templates (`state.billTemplates`) and instances (`state.bills`).
- If instances duplicate after multiple regenerations, ensure regenerate removes unpaid future ones before adding.

Run these scenarios and report any failures or unexpected behaviors; I can iterate fixes from there.
