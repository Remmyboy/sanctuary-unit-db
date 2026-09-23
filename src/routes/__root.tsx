import { Outlet, createRootRoute, HeadContent, Scripts } from '@tanstack/react-router';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Header } from '../components/Header';
import { QueueBanner } from '../components/QueueBanner';
import appCss from '../styles.css?url';

// The header's BrandMark, inlined: octagon plus the split sun.
const FAVICON =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><path d='M20 6H44L58 20V44L44 58H20L6 44V20Z' fill='%23070a0f' stroke='%233fd0ff' stroke-width='5'/><path d='M21.39 39.5A13 13 0 0 1 39.5 21.39Z' fill='%233fd0ff'/><path d='M42.61 24.5A13 13 0 0 1 24.5 42.61Z' fill='%233fd0ff' opacity='.55'/></svg>";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#070a0f' },
      { title: 'SanctuaryDB' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: FAVICON },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Header />
        <QueueBanner />
        <Outlet />
        <Analytics />
        <SpeedInsights />
        <Scripts />
      </body>
    </html>
  );
}
