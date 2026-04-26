# Firestore Setup

Follow these steps in Firebase for the live shared order database:

1. Open your Firebase project: `antarmana-sweets-and-snacks`
2. Go to `Build -> Firestore Database`
3. Click `Create database`
4. Choose `Production mode`
5. Select a region near your customers
6. Open `Authentication -> Sign-in method`
7. Enable `Email/Password`
8. Create one owner user in `Authentication -> Users`
9. Open `Firestore Database -> Rules`
10. Paste the contents of `firestore.rules`
11. Replace `replace-with-your-owner-email@example.com` with your real owner email
12. Click `Publish`

After that:

- Customer orders from the website will save in Firestore
- Owner dashboard will open only after Firebase email/password sign-in
- Owner can read and update orders from any device
