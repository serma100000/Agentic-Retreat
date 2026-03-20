/**
 * Complete, runnable code examples for the OpenPulse API.
 *
 * Examples are provided in JavaScript, Python, and Go for
 * common API operations: status checks, report submission,
 * outage listing, WebSocket subscriptions, analytics queries,
 * and notification preference management.
 */

import type { CodeExample } from './types.js';

interface ExampleSet {
  title: string;
  description: string;
  examples: CodeExample[];
}

export const codeExamples: Record<string, ExampleSet> = {
  getServiceStatus: {
    title: 'Get Service Status',
    description: 'Retrieve the current operational status of a service by its slug.',
    examples: [
      {
        language: 'javascript',
        description: 'Fetch the current status of GitHub using the Fetch API.',
        code: `const API_BASE = 'https://api.openpulse.dev';

async function getServiceStatus(slug) {
  const response = await fetch(\`\${API_BASE}/api/v1/services/\${slug}/status\`);

  if (!response.ok) {
    throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
  }

  const data = await response.json();
  console.log(\`Service: \${data.slug}\`);
  console.log(\`Status: \${data.status}\`);
  console.log(\`Confidence: \${(data.confidence * 100).toFixed(1)}%\`);
  return data;
}

getServiceStatus('github')
  .then(status => console.log('Done:', status))
  .catch(err => console.error('Error:', err.message));`,
      },
      {
        language: 'python',
        description: 'Fetch the current status of GitHub using the requests library.',
        code: `import requests

API_BASE = "https://api.openpulse.dev"

def get_service_status(slug: str) -> dict:
    response = requests.get(f"{API_BASE}/api/v1/services/{slug}/status")
    response.raise_for_status()
    data = response.json()
    print(f"Service: {data['slug']}")
    print(f"Status: {data['status']}")
    print(f"Confidence: {data['confidence'] * 100:.1f}%")
    return data

if __name__ == "__main__":
    status = get_service_status("github")
    print(f"Result: {status}")`,
      },
      {
        language: 'go',
        description: 'Fetch the current status of GitHub using net/http.',
        code: `package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

const apiBase = "https://api.openpulse.dev"

type ServiceStatus struct {
	Slug       string  \`json:"slug"\`
	Status     string  \`json:"status"\`
	Confidence float64 \`json:"confidence"\`
}

func getServiceStatus(slug string) (*ServiceStatus, error) {
	url := fmt.Sprintf("%s/api/v1/services/%s/status", apiBase, slug)
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var status ServiceStatus
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return nil, fmt.Errorf("decode failed: %w", err)
	}

	return &status, nil
}

func main() {
	status, err := getServiceStatus("github")
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Service: %s\\nStatus: %s\\nConfidence: %.1f%%\\n",
		status.Slug, status.Status, status.Confidence*100)
}`,
      },
    ],
  },

  submitReport: {
    title: 'Submit an Outage Report',
    description: 'Submit a user report indicating a service disruption.',
    examples: [
      {
        language: 'javascript',
        description: 'Submit an outage report for a service using fetch.',
        code: `const API_BASE = 'https://api.openpulse.dev';

async function submitReport(serviceSlug, type, description, region) {
  const response = await fetch(\`\${API_BASE}/api/v1/reports\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceSlug,
      type,
      description,
      region,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(\`Report failed: \${error.message}\`);
  }

  const report = await response.json();
  console.log(\`Report submitted: \${report.id}\`);
  return report;
}

submitReport('github', 'down', 'Cannot push to repositories', 'us-east')
  .then(report => console.log('Report ID:', report.id))
  .catch(err => console.error(err.message));`,
      },
      {
        language: 'python',
        description: 'Submit an outage report for a service using requests.',
        code: `import requests

API_BASE = "https://api.openpulse.dev"

def submit_report(
    service_slug: str,
    report_type: str,
    description: str = "",
    region: str = ""
) -> dict:
    payload = {
        "serviceSlug": service_slug,
        "type": report_type,
        "description": description,
        "region": region,
    }
    response = requests.post(f"{API_BASE}/api/v1/reports", json=payload)
    response.raise_for_status()
    report = response.json()
    print(f"Report submitted: {report['id']}")
    return report

if __name__ == "__main__":
    result = submit_report(
        service_slug="github",
        report_type="down",
        description="Cannot push to repositories",
        region="us-east"
    )
    print(f"Report ID: {result['id']}")`,
      },
      {
        language: 'go',
        description: 'Submit an outage report for a service using net/http.',
        code: `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

const apiBase = "https://api.openpulse.dev"

type ReportRequest struct {
	ServiceSlug string \`json:"serviceSlug"\`
	Type        string \`json:"type"\`
	Description string \`json:"description"\`
	Region      string \`json:"region"\`
}

type ReportResponse struct {
	ID          string \`json:"id"\`
	ServiceSlug string \`json:"serviceSlug"\`
	Type        string \`json:"type"\`
}

func submitReport(req ReportRequest) (*ReportResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal failed: %w", err)
	}

	resp, err := http.Post(
		apiBase+"/api/v1/reports",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var report ReportResponse
	if err := json.NewDecoder(resp.Body).Decode(&report); err != nil {
		return nil, fmt.Errorf("decode failed: %w", err)
	}

	return &report, nil
}

func main() {
	report, err := submitReport(ReportRequest{
		ServiceSlug: "github",
		Type:        "down",
		Description: "Cannot push to repositories",
		Region:      "us-east",
	})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Report submitted: %s\\n", report.ID)
}`,
      },
    ],
  },

  listActiveOutages: {
    title: 'List Active Outages',
    description: 'Retrieve all currently active outages across monitored services.',
    examples: [
      {
        language: 'javascript',
        description: 'Fetch all active outages and display a summary.',
        code: `const API_BASE = 'https://api.openpulse.dev';

async function listActiveOutages(options = {}) {
  const params = new URLSearchParams();
  if (options.state) params.set('state', options.state);
  if (options.category) params.set('category', options.category);
  if (options.limit) params.set('limit', String(options.limit));

  const url = \`\${API_BASE}/api/v1/outages?\${params}\`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
  }

  const { data, total } = await response.json();
  console.log(\`Active outages: \${total}\`);

  for (const outage of data) {
    console.log(\`  [\${outage.state}] \${outage.serviceName} - confidence: \${(outage.confidence * 100).toFixed(0)}%\`);
    if (outage.affectedRegions?.length) {
      console.log(\`    Regions: \${outage.affectedRegions.join(', ')}\`);
    }
  }

  return data;
}

listActiveOutages({ limit: 10 })
  .catch(err => console.error(err.message));`,
      },
      {
        language: 'python',
        description: 'Fetch all active outages using requests.',
        code: `import requests

API_BASE = "https://api.openpulse.dev"

def list_active_outages(
    state: str | None = None,
    category: str | None = None,
    limit: int = 20
) -> list[dict]:
    params = {"limit": limit}
    if state:
        params["state"] = state
    if category:
        params["category"] = category

    response = requests.get(f"{API_BASE}/api/v1/outages", params=params)
    response.raise_for_status()
    result = response.json()

    print(f"Active outages: {result['total']}")
    for outage in result["data"]:
        confidence = outage["confidence"] * 100
        print(f"  [{outage['state']}] {outage['serviceName']} - {confidence:.0f}%")
        regions = outage.get("affectedRegions", [])
        if regions:
            print(f"    Regions: {', '.join(regions)}")

    return result["data"]

if __name__ == "__main__":
    outages = list_active_outages(limit=10)
    print(f"\\nTotal returned: {len(outages)}")`,
      },
      {
        language: 'go',
        description: 'Fetch all active outages using net/http.',
        code: `package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
)

const apiBase = "https://api.openpulse.dev"

type Outage struct {
	ID              string   \`json:"id"\`
	ServiceName     string   \`json:"serviceName"\`
	State           string   \`json:"state"\`
	Confidence      float64  \`json:"confidence"\`
	AffectedRegions []string \`json:"affectedRegions"\`
}

type OutageList struct {
	Data  []Outage \`json:"data"\`
	Total int      \`json:"total"\`
}

func listActiveOutages(limit int) (*OutageList, error) {
	u, _ := url.Parse(apiBase + "/api/v1/outages")
	q := u.Query()
	q.Set("limit", fmt.Sprintf("%d", limit))
	u.RawQuery = q.Encode()

	resp, err := http.Get(u.String())
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	var result OutageList
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode failed: %w", err)
	}

	return &result, nil
}

func main() {
	list, err := listActiveOutages(10)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Active outages: %d\\n", list.Total)
	for _, o := range list.Data {
		fmt.Printf("  [%s] %s - %.0f%%\\n", o.State, o.ServiceName, o.Confidence*100)
		if len(o.AffectedRegions) > 0 {
			fmt.Printf("    Regions: %s\\n", strings.Join(o.AffectedRegions, ", "))
		}
	}
}`,
      },
    ],
  },

  subscribeWebSocket: {
    title: 'Subscribe to WebSocket Updates',
    description: 'Connect to the WebSocket gateway and subscribe to real-time outage updates.',
    examples: [
      {
        language: 'javascript',
        description: 'Connect to WebSocket and subscribe to outage updates.',
        code: `const WebSocket = require('ws');

const WS_URL = 'wss://api.openpulse.dev/ws';

function subscribeToOutages(serviceSlug) {
  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('Connected to OpenPulse WebSocket');

    // Subscribe to all outage updates
    ws.send(JSON.stringify({
      type: 'subscribe',
      channel: 'outages:*',
    }));

    // Subscribe to a specific service
    if (serviceSlug) {
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: \`outages:\${serviceSlug}\`,
      }));
    }
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());

    switch (msg.type) {
      case 'welcome':
        console.log('Server welcome received');
        break;
      case 'subscribed':
        console.log(\`Subscribed to: \${msg.channel}\`);
        break;
      case 'data':
        console.log(\`[\${msg.channel}] Update:\`, msg.payload);
        break;
      case 'pong':
        break;
      default:
        console.log('Unknown message:', msg);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(\`Disconnected: \${code} \${reason}\`);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });

  // Keep-alive ping every 30 seconds
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 30000);

  return () => {
    clearInterval(pingInterval);
    ws.close();
  };
}

const disconnect = subscribeToOutages('github');

// Disconnect after 5 minutes
setTimeout(() => {
  disconnect();
  console.log('Disconnected gracefully');
}, 300000);`,
      },
      {
        language: 'python',
        description: 'Connect to WebSocket using websockets library.',
        code: `import asyncio
import json
import websockets

WS_URL = "wss://api.openpulse.dev/ws"

async def subscribe_to_outages(service_slug: str | None = None):
    async with websockets.connect(WS_URL) as ws:
        print("Connected to OpenPulse WebSocket")

        # Subscribe to all outage updates
        await ws.send(json.dumps({
            "type": "subscribe",
            "channel": "outages:*"
        }))

        # Subscribe to a specific service
        if service_slug:
            await ws.send(json.dumps({
                "type": "subscribe",
                "channel": f"outages:{service_slug}"
            }))

        async def send_pings():
            while True:
                await asyncio.sleep(30)
                await ws.send(json.dumps({"type": "ping"}))

        ping_task = asyncio.create_task(send_pings())

        try:
            async for raw in ws:
                msg = json.loads(raw)
                msg_type = msg.get("type")

                if msg_type == "welcome":
                    print("Server welcome received")
                elif msg_type == "subscribed":
                    print(f"Subscribed to: {msg['channel']}")
                elif msg_type == "data":
                    print(f"[{msg['channel']}] Update: {msg['payload']}")
                elif msg_type == "pong":
                    pass
                else:
                    print(f"Unknown message: {msg}")
        finally:
            ping_task.cancel()

if __name__ == "__main__":
    asyncio.run(subscribe_to_outages("github"))`,
      },
      {
        language: 'go',
        description: 'Connect to WebSocket using gorilla/websocket.',
        code: `package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"time"

	"github.com/gorilla/websocket"
)

const wsURL = "wss://api.openpulse.dev/ws"

type WSMessage struct {
	Type    string      \`json:"type"\`
	Channel string      \`json:"channel,omitempty"\`
	Payload interface{} \`json:"payload,omitempty"\`
}

func main() {
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		log.Fatal("dial:", err)
	}
	defer conn.Close()
	fmt.Println("Connected to OpenPulse WebSocket")

	// Subscribe to all outage updates
	subscribe := WSMessage{Type: "subscribe", Channel: "outages:*"}
	if err := conn.WriteJSON(subscribe); err != nil {
		log.Fatal("subscribe:", err)
	}

	// Keep-alive ping goroutine
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if err := conn.WriteJSON(WSMessage{Type: "ping"}); err != nil {
				return
			}
		}
	}()

	// Handle graceful shutdown
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)

	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			_, raw, err := conn.ReadMessage()
			if err != nil {
				log.Println("read:", err)
				return
			}

			var msg WSMessage
			if err := json.Unmarshal(raw, &msg); err != nil {
				log.Println("unmarshal:", err)
				continue
			}

			switch msg.Type {
			case "welcome":
				fmt.Println("Server welcome received")
			case "subscribed":
				fmt.Printf("Subscribed to: %s\\n", msg.Channel)
			case "data":
				fmt.Printf("[%s] Update: %v\\n", msg.Channel, msg.Payload)
			case "pong":
				// ignore
			default:
				fmt.Printf("Unknown message: %+v\\n", msg)
			}
		}
	}()

	select {
	case <-done:
	case <-interrupt:
		fmt.Println("\\nDisconnecting...")
		conn.WriteMessage(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
		)
		<-done
	}
}`,
      },
    ],
  },

  queryAnalytics: {
    title: 'Query Analytics',
    description: 'Query historical outage analytics, trends, and reliability metrics.',
    examples: [
      {
        language: 'javascript',
        description: 'Fetch reliability metrics and trend data.',
        code: `const API_BASE = 'https://api.openpulse.dev';

async function getReliability(slug) {
  const response = await fetch(
    \`\${API_BASE}/api/v1/analytics/services/\${slug}/reliability\`
  );
  if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
  return response.json();
}

async function getTrends(period = 'monthly', months = 6) {
  const params = new URLSearchParams({ period, months: String(months) });
  const response = await fetch(
    \`\${API_BASE}/api/v1/analytics/trends?\${params}\`
  );
  if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
  return response.json();
}

async function getLeaderboard(limit = 10) {
  const response = await fetch(
    \`\${API_BASE}/api/v1/analytics/leaderboard?limit=\${limit}\`
  );
  if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
  return response.json();
}

async function main() {
  const reliability = await getReliability('github');
  console.log('GitHub reliability:', reliability);

  const trends = await getTrends('monthly', 3);
  console.log('\\nRecent trends:');
  for (const t of trends.data) {
    console.log(\`  \${t.period}: \${t.totalOutages} outages across \${t.serviceCount} services\`);
  }

  const leaderboard = await getLeaderboard(5);
  console.log('\\nTop 5 most reliable:');
  for (const entry of leaderboard.data) {
    console.log(\`  #\${entry.rank} \${entry.serviceName} - \${entry.uptimePercent.toFixed(2)}%\`);
  }
}

main().catch(console.error);`,
      },
      {
        language: 'python',
        description: 'Fetch reliability metrics and trend data using requests.',
        code: `import requests

API_BASE = "https://api.openpulse.dev"

def get_reliability(slug: str) -> dict:
    resp = requests.get(f"{API_BASE}/api/v1/analytics/services/{slug}/reliability")
    resp.raise_for_status()
    return resp.json()

def get_trends(period: str = "monthly", months: int = 6) -> dict:
    resp = requests.get(
        f"{API_BASE}/api/v1/analytics/trends",
        params={"period": period, "months": months},
    )
    resp.raise_for_status()
    return resp.json()

def get_leaderboard(limit: int = 10) -> dict:
    resp = requests.get(
        f"{API_BASE}/api/v1/analytics/leaderboard",
        params={"limit": limit},
    )
    resp.raise_for_status()
    return resp.json()

if __name__ == "__main__":
    reliability = get_reliability("github")
    r = reliability.get("reliability")
    if r:
        print(f"GitHub uptime: {r['uptimePercent']:.2f}%")
        print(f"Total outages: {r['totalOutages']}")

    trends = get_trends("monthly", 3)
    print("\\nRecent trends:")
    for t in trends["data"]:
        print(f"  {t['period']}: {t['totalOutages']} outages "
              f"across {t['serviceCount']} services")

    board = get_leaderboard(5)
    print("\\nTop 5 most reliable:")
    for entry in board["data"]:
        print(f"  #{entry['rank']} {entry['serviceName']} "
              f"- {entry['uptimePercent']:.2f}%")`,
      },
      {
        language: 'go',
        description: 'Fetch reliability metrics using net/http.',
        code: `package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

const apiBase = "https://api.openpulse.dev"

type ReliabilityResponse struct {
	Reliability *struct {
		ServiceSlug   string  \`json:"serviceSlug"\`
		UptimePercent float64 \`json:"uptimePercent"\`
		TotalOutages  int     \`json:"totalOutages"\`
		MTTR          float64 \`json:"mttr"\`
	} \`json:"reliability"\`
}

type TrendEntry struct {
	Period       string \`json:"period"\`
	TotalOutages int    \`json:"totalOutages"\`
	ServiceCount int    \`json:"serviceCount"\`
}

type TrendsResponse struct {
	Data []TrendEntry \`json:"data"\`
}

func fetchJSON(url string, target interface{}) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return json.NewDecoder(resp.Body).Decode(target)
}

func main() {
	var rel ReliabilityResponse
	url := fmt.Sprintf("%s/api/v1/analytics/services/github/reliability", apiBase)
	if err := fetchJSON(url, &rel); err != nil {
		log.Fatal(err)
	}
	if rel.Reliability != nil {
		fmt.Printf("GitHub uptime: %.2f%%\\n", rel.Reliability.UptimePercent)
		fmt.Printf("Total outages: %d\\n", rel.Reliability.TotalOutages)
	}

	var trends TrendsResponse
	url = fmt.Sprintf("%s/api/v1/analytics/trends?period=monthly&months=3", apiBase)
	if err := fetchJSON(url, &trends); err != nil {
		log.Fatal(err)
	}
	fmt.Println("\\nRecent trends:")
	for _, t := range trends.Data {
		fmt.Printf("  %s: %d outages across %d services\\n",
			t.Period, t.TotalOutages, t.ServiceCount)
	}
}`,
      },
    ],
  },

  manageNotifications: {
    title: 'Manage Notification Preferences',
    description: 'Get and update notification channel preferences for your account.',
    examples: [
      {
        language: 'javascript',
        description: 'Get and update notification preferences using fetch.',
        code: `const API_BASE = 'https://api.openpulse.dev';
const AUTH_TOKEN = process.env.OPENPULSE_TOKEN;

const headers = {
  'Content-Type': 'application/json',
  'Authorization': \`Bearer \${AUTH_TOKEN}\`,
};

async function getPreferences() {
  const response = await fetch(\`\${API_BASE}/api/v1/notifications/preferences\`, {
    headers,
  });
  if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
  return response.json();
}

async function updatePreferences(channel, config, enabled, options = {}) {
  const response = await fetch(\`\${API_BASE}/api/v1/notifications/preferences\`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      channel,
      config,
      enabled,
      serviceFilters: options.serviceFilters,
      minSeverity: options.minSeverity,
    }),
  });
  if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
  return response.json();
}

async function main() {
  // Get current preferences
  const prefs = await getPreferences();
  console.log('Current preferences:', prefs.data);

  // Enable Slack notifications for high severity
  const updated = await updatePreferences(
    'slack',
    { webhookUrl: 'https://hooks.slack.com/services/xxx/yyy/zzz' },
    true,
    {
      minSeverity: 'high',
      serviceFilters: ['github', 'aws', 'cloudflare'],
    }
  );
  console.log('Updated:', updated);

  // Enable email notifications
  await updatePreferences(
    'email',
    { address: 'ops@example.com' },
    true,
    { minSeverity: 'critical' }
  );
  console.log('Email notifications enabled');
}

main().catch(console.error);`,
      },
      {
        language: 'python',
        description: 'Get and update notification preferences using requests.',
        code: `import os
import requests

API_BASE = "https://api.openpulse.dev"
AUTH_TOKEN = os.environ.get("OPENPULSE_TOKEN", "")

session = requests.Session()
session.headers.update({
    "Authorization": f"Bearer {AUTH_TOKEN}",
    "Content-Type": "application/json",
})

def get_preferences() -> dict:
    resp = session.get(f"{API_BASE}/api/v1/notifications/preferences")
    resp.raise_for_status()
    return resp.json()

def update_preferences(
    channel: str,
    config: dict,
    enabled: bool,
    service_filters: list[str] | None = None,
    min_severity: str | None = None,
) -> dict:
    payload = {
        "channel": channel,
        "config": config,
        "enabled": enabled,
    }
    if service_filters:
        payload["serviceFilters"] = service_filters
    if min_severity:
        payload["minSeverity"] = min_severity

    resp = session.put(
        f"{API_BASE}/api/v1/notifications/preferences",
        json=payload,
    )
    resp.raise_for_status()
    return resp.json()

if __name__ == "__main__":
    prefs = get_preferences()
    print("Current preferences:")
    for p in prefs.get("data", []):
        status = "enabled" if p["enabled"] else "disabled"
        print(f"  {p['channel']}: {status}")

    updated = update_preferences(
        channel="slack",
        config={"webhookUrl": "https://hooks.slack.com/services/xxx/yyy/zzz"},
        enabled=True,
        service_filters=["github", "aws"],
        min_severity="high",
    )
    print(f"\\nUpdated: {updated}")`,
      },
      {
        language: 'go',
        description: 'Get and update notification preferences using net/http.',
        code: `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
)

const apiBase = "https://api.openpulse.dev"

var authToken = os.Getenv("OPENPULSE_TOKEN")

type Preference struct {
	Channel        string   \`json:"channel"\`
	Config         any      \`json:"config"\`
	Enabled        bool     \`json:"enabled"\`
	ServiceFilters []string \`json:"serviceFilters,omitempty"\`
	MinSeverity    string   \`json:"minSeverity,omitempty"\`
}

type PrefsResponse struct {
	Data []Preference \`json:"data"\`
}

func authedRequest(method, url string, body any) (*http.Response, error) {
	var reader io.Reader
	if body != nil {
		data, _ := json.Marshal(body)
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, url, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+authToken)
	req.Header.Set("Content-Type", "application/json")
	return http.DefaultClient.Do(req)
}

func getPreferences() (*PrefsResponse, error) {
	resp, err := authedRequest("GET", apiBase+"/api/v1/notifications/preferences", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var prefs PrefsResponse
	if err := json.NewDecoder(resp.Body).Decode(&prefs); err != nil {
		return nil, err
	}
	return &prefs, nil
}

func updatePreferences(pref Preference) error {
	resp, err := authedRequest("PUT", apiBase+"/api/v1/notifications/preferences", pref)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}
	return nil
}

func main() {
	prefs, err := getPreferences()
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("Current preferences:")
	for _, p := range prefs.Data {
		status := "disabled"
		if p.Enabled {
			status = "enabled"
		}
		fmt.Printf("  %s: %s\\n", p.Channel, status)
	}

	err = updatePreferences(Preference{
		Channel:        "slack",
		Config:         map[string]string{"webhookUrl": "https://hooks.slack.com/services/xxx"},
		Enabled:        true,
		ServiceFilters: []string{"github", "aws"},
		MinSeverity:    "high",
	})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("\\nSlack notifications enabled")
}`,
      },
    ],
  },
};
