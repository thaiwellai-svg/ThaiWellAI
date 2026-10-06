# Study cases (end-to-end)

31 end-to-end cases covering different patient types and staff roles (reception, therapist, cashier, doctor, admin). The tests drive the real UI in WebKit at iPad size.

```bash
npm run build && npx vite preview --port 5188   # in another terminal
npm i -D playwright-core && npx playwright install webkit
npm run qa            # or: node qa/study-cases.js R C   (run only some groups)
```

- Every case starts from fresh sample data.
- Staff roles are simulated by switching the user profile (name / role). The tests check that the audit log records who did each action.
- D03 calls the real AI service, so it needs an internet connection. It takes about 45 seconds.
- Failing cases save a screenshot to `qa/shots/`, and results are written to `qa/results.json`.
