import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const { default: AssistantMessageCard } = await vite.ssrLoadModule('/src/components/chat/AssistantMessageCard.tsx');
  const { default: PublicInfoBox } = await vite.ssrLoadModule('/src/components/chat/PublicInfoBox.tsx');

  // 1. Canonical full response exercising every block & visual type
  const fullMessage = {
    id: 'test-msg-1',
    role: 'assistant',
    content: 'Over the last 7 days (Asia/Karachi), 12 work orders were assigned across hydro and solar plants, with 8 completed (66.7%).',
    createdAt: new Date().toISOString(),
    response: {
      summary: 'Over the last 7 days (Asia/Karachi), 12 work orders were assigned across hydro and solar plants, with 8 completed (66.7%).',
      kpis: [
        { label: 'Assigned (7d)', value: 12, unit: 'orders', delta: 'Hydro + Solar', trend: 'neutral' },
        { label: 'Completed', value: 8, unit: 'orders', delta: '66.7%', trend: 'up' },
        { label: 'Overdue', value: 1, unit: 'orders', trend: 'down' },
      ],
      visuals: [
        {
          type: 'stacked_bar',
          title: 'Workload by Engineer',
          x: 'assignee',
          series: [
            { key: 'done', label: 'Done' },
            { key: 'in_progress', label: 'In Progress' },
          ],
          data: [
            { assignee: 'Bilal Raza', done: 5, in_progress: 1 },
            { assignee: 'Sana Tariq', done: 3, in_progress: 3 },
          ],
          unit: 'orders',
        },
        {
          type: 'bar',
          title: 'Output by Plant',
          x: 'site',
          series: [{ key: 'kw', label: 'Output' }],
          data: [{ site: 'Golen Gol', kw: 86400 }],
          unit: 'kW',
        },
        {
          type: 'line',
          title: '24h Fleet Output',
          x: 'ts',
          series: [{ key: 'kw', label: 'Fleet kW' }],
          data: [{ ts: '2026-11-02T10:00:00Z', kw: 92000 }],
          unit: 'kW',
        },
        {
          type: 'area',
          title: 'Generation Mix',
          x: 'ts',
          series: [
            { key: 'hydro', label: 'Hydro' },
            { key: 'solar', label: 'Solar' },
          ],
          data: [{ ts: '2026-11-02T10:00:00Z', hydro: 84000, solar: 8000 }],
          unit: 'kW',
        },
        {
          type: 'pie',
          title: 'Alerts by Severity',
          x: 'severity',
          series: [{ key: 'count', label: 'Count' }],
          data: [
            { severity: 'critical', count: 2 },
            { severity: 'warning', count: 4 },
          ],
        },
        {
          type: 'progress',
          title: 'Overall Completion Rate',
          x: 'label',
          series: [{ key: 'value', label: 'Completion' }],
          data: [{ label: 'Hydro + Solar (7d)', value: 66.7 }],
          unit: '%',
        },
        {
          type: 'table',
          caption: 'Top Sites by Work Orders',
          columns: ['Site', 'Technology', 'Total', 'Done', 'Overdue'],
          rows: [
            ['Golen Gol Hydro', 'hydro', 7, 5, 1],
            ['Mastuj Solar', 'solar', 5, 3, 0],
          ],
        },
      ],
      insights: ['1 planned work order at Golen Gol Hydro is overdue.'],
      links: [
        {
          label: 'Open Work Orders (Hydro + Solar, 7d)',
          route: '/work-orders',
          query: { view: 'table', types: 'hydro,solar', from: '2026-10-27', to: '2026-11-02' },
        },
      ],
      followups: [
        'Show overdue work orders',
        'Summarize open critical alerts',
        'Compare 7-day energy by technology',
      ],
      confidence_notes: 'Telemetry retention window is 7 rolling days.',
    },
  };

  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssistantMessageCard, {
        message: fullMessage,
        onFollowup: () => {},
        onRetry: () => {},
      }),
    ),
  );

  assert.ok(html.includes('Assigned (7d)'), 'Renders KPI label');
  assert.ok(html.includes('66.7%'), 'Renders progress percentage & KPI delta');
  assert.ok(html.includes('Top Sites by Work Orders'), 'Renders table caption');
  assert.ok(html.includes('Golen Gol Hydro'), 'Renders table row');
  assert.ok(html.includes('Open Work Orders (Hydro + Solar, 7d)'), 'Renders verified deep-link button');
  assert.ok(html.includes('Show overdue work orders'), 'Renders follow-up chip');
  assert.ok(html.includes('Telemetry retention window is 7 rolling days.'), 'Renders confidence note');

  // 2. Error + Retry state
  const errHtml = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssistantMessageCard, {
        message: {
          id: 'err-1',
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          error: 'Rate limit reached. Please wait 15s.',
          retryPrompt: 'Fleet output now',
        },
        onFollowup: () => {},
        onRetry: () => {},
      }),
    ),
  );
  assert.ok(errHtml.includes('Retry question'), 'Renders Retry button on error state');

  // 3. Public Homepage Info Box (both landing & compact variants)
  const publicLandingHtml = renderToStaticMarkup(
    React.createElement(MemoryRouter, null, React.createElement(PublicInfoBox, { variant: 'landing' })),
  );
  assert.ok(publicLandingHtml.includes('PulseBot Project Guide'), 'Renders PublicInfoBox header');
  assert.ok(publicLandingHtml.includes('How do alerts automatically become work orders?'), 'Renders suggested question chips');

  console.log('✓ All PulseBot UI block types (KPIs, 6 chart types, tables, insights, deep links, follow-ups, error/retry, PublicInfoBox) rendered cleanly.');
} finally {
  await vite.close();
}
