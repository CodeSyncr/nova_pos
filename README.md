# NovaPOS Web Platform

The **NovaPOS Web Platform** is a multi-tenant Point of Sale (POS) and store management system built with Next.js 16 (App Router), React 19, Tailwind CSS v4, and Supabase. 

It serves as the backend database controller, onboarding engine, and central web dashboard for store owners to manage categories, products, customer catalogs, table grids, staff, and payments.

---

## Core Features

- **🏢 Multi-Tenant SaaS Architecture**: Scalable tenant mapping where every store configuration, product, customer directory, and order is securely separated by `tenant_id`.
- **🌐 Custom Domain & Subdomain Routing**: Dynamic domain resolution through middleware mapping custom user-specific subdomains to their active POS billing portals (integrated with Cloudflare).
- **🛒 Dynamic Point of Sale (POS)**: Interactive sales panel featuring categories selection, search queries, real-time variant/topping modification sheets, and transaction processing.
- **🧾 Transaction & Order Management**: Detailed analytics for transaction histories, status lifecycles (Pending -> Preparing -> Ready -> Completed), and invoice template generator (HTML to PDF/Image).
- **👥 Customer Directory & CRM**: Advanced customer catalog featuring in-memory search and filtering, loyalty profiles tracking, and interactive modals for creating/editing guest details.
- **📅 Staff Attendance & Salary Management**: Automated payroll calculations based on daily rates, absence deductions, and half-day records, managed through a premium redesigned dark-themed staff portal.
- **💳 Payment Gateway Integration**: Integrated with Razorpay for secure digital payment checkouts.
- **🔔 Real-Time Notifications**: Firebase Cloud Messaging and Web Push Notifications for staff reminders and preparation alerts.
- **🛡️ Secure Authorization**: Supabase SSR Auth providing secure session logins, signup registers, onboarding checklists, and role-based permissions (Admin, Cashier, Kitchen).

---

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Library**: React 19
- **Database / Auth**: Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- **Styling**: Tailwind CSS v4, Framer Motion (micro-animations), Radix UI (accessible overlays)
- **Payments**: Razorpay
- **Notifications**: Firebase & Web-Push
- **Containerization**: Multi-stage Docker deployment (Next.js standalone mode)

---

## Project Structure & Core Directories

- **`src/app/`**: Next.js App Router folders:
  - **`(auth)`**: Sign-in, sign-up, and password recovery pages.
  - **`(dashboard)`**: Main workspace dashboard containing routes for POS, Orders, Customers, Inventory, and Settings.
  - **`actions/`**: Server Actions managing tenant settings mutations, onboarding states, and domain mappings.
  - **`api/`**: API endpoints managing verify-domain calls, webhooks, and push notification crons.
  - **`custom-domain/`**: Nested router handling dynamic subdirectories mapping to public-facing invoice routes.
- **`src/components/`**: Fenced reusable components grouped by features (POS layout panels, variant configuration sheets, billing cards, domain setup guides).
- **`src/lib/`**: Core helper modules, database adapters, user permissions matrices, and validation schemas.
- **`supabase/`**: SQL migration scripts, database schemas, and configuration setup templates.
- **`Dockerfile`**: Docker containerization configuration compiled in three stages for optimized lightweight builds.

---

## Getting Started

### 1. Environment Setup
Copy the configuration template to create your local `.env.local` file:
```bash
cp .env.example .env.local
```
Update the Supabase endpoints, service keys, Razorpay credentials, and domain configs inside `.env.local`.

### 2. Install Dependencies
This project uses **pnpm** as its primary package manager. Install all packages by running:
```bash
pnpm install
```

### 3. Run Development Server
Start the Next.js local server on your machine:
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

---

## Production Deployment (Docker)

To build and run the production application container in Next.js standalone mode:

```bash
# Build the Docker image
docker build -t novapos-web-platform .

# Run the container (Exposes port 3000)
docker run -p 3000:3000 --env-file .env.local novapos-web-platform
```

---

## Related Projects
- **Native iOS Client**: [NovaPos iOS App](file:///Users/yashkumar/Documents/Projects/NovaPos/README.md) (SwiftUI client using native Supabase REST clients and Esc/Pos Thermal Printer SDK integration).
