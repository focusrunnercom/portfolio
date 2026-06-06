#!/usr/bin/env python3
"""
SEO Monitoring Script — Weekly GSC & GA4 data collection
Pulls Google Search Console and GA4 metrics, logs to Obsidian

Requirements:
- pip install google-auth-oauthlib google-analytics-python-api
- Google Cloud credentials at ~/.focusrunner/gsc-credentials.json (service account)
- GA4 Property ID: 465033044
"""

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Google API imports (install if needed)
try:
    from google.oauth2 import service_account
    from google.analytics.admin import AnalyticsAdminServiceClient
    from googleapiclient.discovery import build
except ImportError:
    print("ERROR: Install google-auth-oauthlib and google-analytics-python")
    sys.exit(1)

# Config
PROPERTY_ID = "465033044"  # GA4 property ID
OBSIDIAN_DIR = Path.home() / "Documents/Obsidian Vault"
OBSIDIAN_SEO = OBSIDIAN_DIR / "03-Knowledge/SEO"
SCOPES = [
    'https://www.googleapis.com/auth/webmasters.readonly',
    'https://www.googleapis.com/auth/analytics.readonly',
]

def load_credentials():
    """Load Google service account credentials."""
    creds_path = Path.home() / ".focusrunner/gsc-credentials.json"
    if not creds_path.exists():
        print(f"ERROR: Credentials not found at {creds_path}")
        return None
    return service_account.Credentials.from_service_account_file(creds_path, scopes=SCOPES)

def pull_gsc_data(service, site_url="focusrunner.io"):
    """Pull top queries, clicks, impressions from GSC."""
    try:
        request = {
            'startDate': (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d'),
            'endDate': datetime.now().strftime('%Y-%m-%d'),
            'dimensions': ['query'],
            'rowLimit': 10,
        }
        response = service.searchanalytics().query(siteUrl=f"https://{site_url}/", body=request).execute()
        
        data = {}
        for row in response.get('rows', []):
            query = row['keys'][0]
            clicks = row.get('clicks', 0)
            impressions = row.get('impressions', 0)
            ctr = row.get('ctr', 0)
            position = row.get('position', 0)
            data[query] = {
                'clicks': int(clicks),
                'impressions': int(impressions),
                'ctr': round(ctr * 100, 2),
                'position': round(position, 1)
            }
        return data
    except Exception as e:
        print(f"ERROR pulling GSC data: {e}")
        return {}

def pull_ga4_data(credentials, property_id):
    """Pull GA4 traffic data."""
    try:
        from google.analytics.data_v1beta import BetaAnalyticsDataClient
        from google.analytics.data_v1beta.types import (
            RunReportRequest,
            Dimension,
            Metric,
            DateRange,
        )
        
        client = BetaAnalyticsDataClient(credentials=credentials)
        
        # 7-day traffic report
        request = RunReportRequest(
            property=f"properties/{property_id}",
            dimensions=[
                Dimension(name="date"),
                Dimension(name="source"),
            ],
            metrics=[
                Metric(name="sessions"),
                Metric(name="bounceRate"),
                Metric(name="conversions"),
            ],
            date_ranges=[DateRange(start_date="7daysAgo", end_date="today")],
        )
        response = client.run_report(request)
        
        data = {
            'total_sessions': 0,
            'total_bounces': 0,
            'total_conversions': 0,
            'by_source': {}
        }
        
        for row in response.rows:
            date = row.dimension_values[0].value
            source = row.dimension_values[1].value
            sessions = int(row.metric_values[0].value)
            bounce_rate = float(row.metric_values[1].value)
            conversions = int(row.metric_values[2].value)
            
            data['total_sessions'] += sessions
            data['total_conversions'] += conversions
            
            if source not in data['by_source']:
                data['by_source'][source] = {'sessions': 0, 'bounce_rate': 0, 'conversions': 0}
            data['by_source'][source]['sessions'] += sessions
            data['by_source'][source]['bounce_rate'] = bounce_rate
            data['by_source'][source]['conversions'] += conversions
        
        return data
    except Exception as e:
        print(f"ERROR pulling GA4 data: {e}")
        return {}

def log_to_obsidian(gsc_data, ga4_data):
    """Write monitoring data to Obsidian."""
    obsidian_file = OBSIDIAN_SEO / "SEO-Monitoring-Weekly.md"
    
    timestamp = datetime.now()
    week_start = (timestamp - timedelta(days=timestamp.weekday())).strftime('%Y-%m-%d')
    week_end = timestamp.strftime('%Y-%m-%d')
    
    # Build markdown
    content = f"""---
date: {timestamp.strftime('%Y-%m-%d')}
week: {week_start} to {week_end}
status: updated
tags: [seo, monitoring, gsc, ga4]
---

# Weekly SEO Monitoring — Week of {week_start}

## Google Search Console (Last 7 Days)

### Top Queries

| Query | Clicks | Impressions | CTR | Avg Position |
|-------|--------|-------------|-----|--------------|
"""
    
    for query, metrics in sorted(gsc_data.items(), key=lambda x: x[1]['clicks'], reverse=True):
        content += f"| {query} | {metrics['clicks']} | {metrics['impressions']} | {metrics['ctr']}% | {metrics['position']} |\n"
    
    content += f"\n## GA4 Traffic (Last 7 Days)\n\n"
    content += f"- **Total Sessions**: {ga4_data.get('total_sessions', 0)}\n"
    content += f"- **Total Conversions**: {ga4_data.get('total_conversions', 0)}\n"
    content += f"- **Conversion Rate**: {round(ga4_data.get('total_conversions', 0) / max(1, ga4_data.get('total_sessions', 1)) * 100, 2)}%\n\n"
    
    content += "### Traffic by Source\n\n| Source | Sessions | Conv Rate | Conversions |\n"
    content += "|--------|----------|-----------|-------------|\n"
    
    for source, metrics in ga4_data.get('by_source', {}).items():
        conv_rate = round(metrics['conversions'] / max(1, metrics['sessions']) * 100, 2) if metrics['sessions'] > 0 else 0
        content += f"| {source} | {metrics['sessions']} | {conv_rate}% | {metrics['conversions']} |\n"
    
    content += f"\n## Action Items\n\n- [ ] Review Core Web Vitals in PageSpeed Insights\n"
    content += f"- [ ] Check indexing status in GSC (check for coverage issues)\n"
    content += f"- [ ] Verify sitemap submissions recent\n"
    content += f"- [ ] Check for crawl errors in GSC\n"
    content += f"- [ ] Consider new blog topics based on search queries above\n"
    
    # Write to file
    with open(obsidian_file, 'a') as f:
        f.write(content + "\n\n---\n")
    
    print(f"✅ Logged to {obsidian_file}")

def main():
    """Run weekly SEO monitoring."""
    print("🔍 Starting SEO monitoring...")
    
    # Load credentials
    credentials = load_credentials()
    if not credentials:
        sys.exit(1)
    
    # Pull GSC data
    print("📊 Pulling Google Search Console data...")
    webmasters = build('webmasters', 'v3', credentials=credentials)
    gsc_data = pull_gsc_data(webmasters)
    
    # Pull GA4 data
    print("📈 Pulling GA4 data...")
    ga4_data = pull_ga4_data(credentials, PROPERTY_ID)
    
    # Log results
    if gsc_data or ga4_data:
        log_to_obsidian(gsc_data, ga4_data)
        print("✅ SEO monitoring complete")
    else:
        print("⚠️ No data retrieved")

if __name__ == "__main__":
    main()
