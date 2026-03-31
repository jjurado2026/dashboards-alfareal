#!/usr/bin/env python3
"""
extract_data.py — Dashboard Data Extraction Pipeline

Extracts advertising and CRM data from Meta Marketing API, Google Ads API,
and HubSpot API, then generates JSON files matching the dashboard schema
and commits them to the repository.

Runs daily via GitHub Actions.
"""

import json
import logging
import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

import requests

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Client configuration
# ---------------------------------------------------------------------------
CLIENTS = [
    {
        "id": "trees",
        "name": "Trees Coliving",
        "meta_account_id": "1399636757673175",
        "meta_token_env": "META_ACCESS_TOKEN_TREES",
        "google_customer_id": "2010567949",
        "google_mcc_id": "7270852417",
        "hubspot_pipeline": "trees_coliving",
        "hubspot_stages": {
            "interesado": "Interesado",
            "lista_espera": "Lista de espera",
            "firmado": "Firmado",
            "sin_disponibilidad": "Sin disponibilidad",
            "descartado": "Descartado",
        },
    },
    {
        "id": "harmonices",
        "name": "Harmonices",
        "meta_account_id": "1472128056670313",
        "meta_token_env": "META_ACCESS_TOKEN_HARMONICES",
        "google_customer_id": "1456796015",
        "google_mcc_id": "7270852417",
        "hubspot_pipeline": "harmonices",
        "hubspot_stages": {
            "lead_entrante": "Lead entrante",
            "exploratorio": "Exploratorio",
            "interesado_futuro": "Interesado futuro",
            "interesado_caliente": "Interesado caliente",
            "reservado_pagado": "Reservado (pagado)",
            "descartado": "Descartado",
        },
    },
]

# History start date for monthly aggregations
HISTORY_START = "2025-01-01"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def safe_div(numerator: float, denominator: float, default: float = 0.0) -> float:
    """Division that returns *default* when denominator is zero."""
    if denominator == 0:
        return default
    return round(numerator / denominator, 2)


def parse_float(val: Any, default: float = 0.0) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def parse_int(val: Any, default: int = 0) -> int:
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


def month_range(year: int, month: int) -> tuple[str, str]:
    """Return (first_day, last_day) strings for a given month."""
    first = datetime(year, month, 1)
    if month == 12:
        last = datetime(year + 1, 1, 1) - timedelta(days=1)
    else:
        last = datetime(year, month + 1, 1) - timedelta(days=1)
    return first.strftime("%Y-%m-%d"), last.strftime("%Y-%m-%d")


def previous_month(year: int, month: int) -> tuple[int, int]:
    if month == 1:
        return year - 1, 12
    return year, month - 1


def read_previous_json(client_id: str, year: int, month: int) -> Optional[dict]:
    """Read previously generated JSON for delta calculations."""
    py, pm = previous_month(year, month)
    path = Path("data") / client_id / f"{py}-{pm:02d}.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            log.warning("Could not read previous month data at %s", path)
    return None


# ---------------------------------------------------------------------------
# Meta Marketing API
# ---------------------------------------------------------------------------

META_API_VERSION = "v21.0"
META_BASE = f"https://graph.facebook.com/{META_API_VERSION}"

# Fields we always request
META_INSIGHT_FIELDS = (
    "impressions,clicks,spend,actions,ctr,cpc,cpp,reach,frequency"
)
META_CAMPAIGN_FIELDS = (
    "campaign_name,impressions,clicks,spend,actions,ctr,cpc,cpp,reach"
)
META_AD_FIELDS = (
    "ad_name,ad_id,impressions,clicks,spend,actions,ctr,cpc"
)


def _meta_get(url: str, params: dict, access_token: str) -> list[dict]:
    """Fetch from Meta API with automatic pagination."""
    params["access_token"] = access_token
    results: list[dict] = []
    while url:
        resp = requests.get(url, params=params, timeout=60)
        resp.raise_for_status()
        body = resp.json()
        results.extend(body.get("data", []))
        url = body.get("paging", {}).get("next")
        params = {}  # next URL already includes params
    return results


def _extract_leads(actions: list[dict] | None) -> int:
    """Sum lead-type actions from Meta actions array."""
    if not actions:
        return 0
    lead_types = {"lead", "offsite_conversion.fb_pixel_lead"}
    return sum(parse_int(a.get("value", 0)) for a in actions if a.get("action_type") in lead_types)


def _meta_insights_to_kpis(rows: list[dict]) -> dict:
    """Aggregate insight rows into KPI dict."""
    impressions = sum(parse_int(r.get("impressions")) for r in rows)
    clicks = sum(parse_int(r.get("clicks")) for r in rows)
    spend = sum(parse_float(r.get("spend")) for r in rows)
    reach = sum(parse_int(r.get("reach")) for r in rows)
    leads = sum(_extract_leads(r.get("actions")) for r in rows)
    ctr = safe_div(clicks * 100, impressions)
    cpc = safe_div(spend, clicks)
    cpl = safe_div(spend, leads)
    return {
        "impresiones": {"value": impressions},
        "clics": {"value": clicks},
        "ctr": {"value": ctr},
        "cpc": {"value": round(cpc, 2)},
        "leads": {"value": leads},
        "cpl": {"value": round(cpl, 2)},
        "inversion": {"value": round(spend, 2)},
        "alcance": {"value": reach},
    }


def extract_meta_ads(
    account_id: str, access_token: str, date_from: str, date_to: str
) -> dict:
    """Full Meta Ads extraction for one account."""
    base = f"{META_BASE}/act_{account_id}"
    time_range = json.dumps({"since": date_from, "until": date_to})

    result: dict[str, Any] = {
        "kpis": {},
        "daily": [],
        "campaigns": [],
        "campaigns_by_platform": [],
        "creatives": [],
        "monthly_history": [],
    }

    # --- 1. Account-level KPIs (current month) ---
    try:
        rows = _meta_get(
            f"{base}/insights",
            {"fields": META_INSIGHT_FIELDS, "time_range": time_range},
            access_token,
        )
        result["kpis"] = _meta_insights_to_kpis(rows)
    except Exception as exc:
        log.error("Meta KPIs failed: %s", exc)

    # --- 2. Daily breakdown ---
    try:
        rows = _meta_get(
            f"{base}/insights",
            {
                "fields": META_INSIGHT_FIELDS,
                "time_range": time_range,
                "time_increment": "1",
            },
            access_token,
        )
        for r in rows:
            leads = _extract_leads(r.get("actions"))
            spend = parse_float(r.get("spend"))
            result["daily"].append(
                {
                    "date": r.get("date_start", ""),
                    "leads": leads,
                    "cpl": safe_div(spend, leads),
                    "impresiones": parse_int(r.get("impressions")),
                    "clics": parse_int(r.get("clicks")),
                    "inversion": round(spend, 2),
                }
            )
    except Exception as exc:
        log.error("Meta daily failed: %s", exc)

    # --- 3. Campaign-level ---
    try:
        rows = _meta_get(
            f"{base}/insights",
            {
                "fields": META_CAMPAIGN_FIELDS,
                "time_range": time_range,
                "level": "campaign",
            },
            access_token,
        )
        for r in rows:
            leads = _extract_leads(r.get("actions"))
            spend = parse_float(r.get("spend"))
            result["campaigns"].append(
                {
                    "name": r.get("campaign_name", ""),
                    "impresiones": parse_int(r.get("impressions")),
                    "clics": parse_int(r.get("clicks")),
                    "ctr": parse_float(r.get("ctr")),
                    "cpc": parse_float(r.get("cpc")),
                    "leads": leads,
                    "cpl": safe_div(spend, leads),
                    "inversion": round(spend, 2),
                    "alcance": parse_int(r.get("reach")),
                }
            )
    except Exception as exc:
        log.error("Meta campaigns failed: %s", exc)

    # --- 4. Campaign by platform ---
    try:
        rows = _meta_get(
            f"{base}/insights",
            {
                "fields": META_CAMPAIGN_FIELDS,
                "time_range": time_range,
                "level": "campaign",
                "breakdowns": "publisher_platform",
                "limit": "500",
            },
            access_token,
        )
        for r in rows:
            leads = _extract_leads(r.get("actions"))
            spend = parse_float(r.get("spend"))
            result["campaigns_by_platform"].append(
                {
                    "campaign": r.get("campaign_name", ""),
                    "platform": r.get("publisher_platform", ""),
                    "impresiones": parse_int(r.get("impressions")),
                    "clics": parse_int(r.get("clicks")),
                    "leads": leads,
                    "cpl": safe_div(spend, leads),
                    "inversion": round(spend, 2),
                }
            )
    except Exception as exc:
        log.error("Meta campaigns_by_platform failed: %s", exc)

    # --- 5. Ad-level (creatives) ---
    try:
        rows = _meta_get(
            f"{base}/insights",
            {
                "fields": META_AD_FIELDS,
                "time_range": time_range,
                "level": "ad",
            },
            access_token,
        )
        for r in rows:
            leads = _extract_leads(r.get("actions"))
            spend = parse_float(r.get("spend"))
            ad_id = r.get("ad_id", "")
            # Fetch creative thumbnail
            image_url = ""
            if ad_id:
                try:
                    thumb_resp = requests.get(
                        f"{META_BASE}/{ad_id}",
                        params={
                            "fields": "creative{thumbnail_url}",
                            "access_token": access_token,
                        },
                        timeout=30,
                    )
                    thumb_resp.raise_for_status()
                    creative = thumb_resp.json().get("creative", {})
                    image_url = creative.get("thumbnail_url", "")
                except Exception:
                    pass

            result["creatives"].append(
                {
                    "name": r.get("ad_name", ""),
                    "ad_id": ad_id,
                    "image_url": image_url,
                    "impresiones": parse_int(r.get("impressions")),
                    "clics": parse_int(r.get("clicks")),
                    "ctr": parse_float(r.get("ctr")),
                    "leads": leads,
                    "cpl": safe_div(spend, leads),
                    "inversion": round(spend, 2),
                }
            )
    except Exception as exc:
        log.error("Meta creatives failed: %s", exc)

    # --- 6. Monthly history (last 14 months) ---
    try:
        today = datetime.now()
        history_start = HISTORY_START
        history_end = today.strftime("%Y-%m-%d")
        history_range = json.dumps({"since": history_start, "until": history_end})
        rows = _meta_get(
            f"{base}/insights",
            {
                "fields": META_INSIGHT_FIELDS,
                "time_range": history_range,
                "time_increment": "monthly",
            },
            access_token,
        )
        for r in rows:
            leads = _extract_leads(r.get("actions"))
            spend = parse_float(r.get("spend"))
            # date_start is like "2025-01-01"
            ds = r.get("date_start", "")
            month_label = ds[:7] if len(ds) >= 7 else ds
            result["monthly_history"].append(
                {
                    "month": month_label,
                    "impresiones": parse_int(r.get("impressions")),
                    "clics": parse_int(r.get("clicks")),
                    "ctr": parse_float(r.get("ctr")),
                    "cpc": parse_float(r.get("cpc")),
                    "leads": leads,
                    "cpl": safe_div(spend, leads),
                    "inversion": round(spend, 2),
                    "alcance": parse_int(r.get("reach")),
                }
            )
    except Exception as exc:
        log.error("Meta monthly history failed: %s", exc)

    return result


# ---------------------------------------------------------------------------
# Google Ads API
# ---------------------------------------------------------------------------

def _build_google_ads_client(login_customer_id: str = "") -> Any:
    """Build a GoogleAdsClient from environment variables."""
    from google.ads.googleads.client import GoogleAdsClient

    config = {
        "developer_token": os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"],
        "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"],
        "refresh_token": os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
        "use_proto_plus": True,
        "login_customer_id": login_customer_id.replace("-", ""),
    }
    return GoogleAdsClient.load_from_dict(config)


def _google_query(
    client: Any, customer_id: str, query: str, mcc_id: Optional[str] = None
) -> list[Any]:
    """Execute a Google Ads query and return all rows with pagination."""
    service = client.get_service("GoogleAdsService")
    rows = []
    request = client.get_type("SearchGoogleAdsRequest")
    request.customer_id = customer_id.replace("-", "")
    request.query = query
    request.page_size = 10000

    response = service.search(request=request)
    for row in response:
        rows.append(row)
    return rows


def _gender_label(gender_type: Any) -> str:
    mapping = {
        "MALE": "Hombre",
        "FEMALE": "Mujer",
        "UNDETERMINED": "Sin determinar",
    }
    name = str(gender_type).split(".")[-1] if "." in str(gender_type) else str(gender_type)
    return mapping.get(name, name)


def _age_label(age_type: Any) -> str:
    name = str(age_type).split(".")[-1] if "." in str(age_type) else str(age_type)
    return name.replace("AGE_RANGE_", "").replace("_", "-")


def extract_google_ads(
    client: Any,
    customer_id: str,
    mcc_id: str,
    date_from: str,
    date_to: str,
) -> dict:
    """Full Google Ads extraction for one customer."""
    cid = customer_id.replace("-", "")
    result: dict[str, Any] = {
        "kpis": {},
        "daily": [],
        "demographics": {"gender": [], "age": []},
        "campaigns": [],
        "keywords": [],
        "monthly_history": [],
    }

    # --- 1. Account-level KPIs ---
    try:
        query = f"""
            SELECT metrics.impressions, metrics.clicks, metrics.cost_micros,
                   metrics.conversions, metrics.ctr, metrics.average_cpc
            FROM customer
            WHERE segments.date BETWEEN '{date_from}' AND '{date_to}'
        """
        rows = _google_query(client, cid, query, mcc_id)
        impressions = clicks = cost_micros = conversions = 0
        for r in rows:
            impressions += r.metrics.impressions
            clicks += r.metrics.clicks
            cost_micros += r.metrics.cost_micros
            conversions += int(r.metrics.conversions)
        spend = cost_micros / 1_000_000
        result["kpis"] = {
            "impresiones": {"value": impressions},
            "clics": {"value": clicks},
            "ctr": {"value": round(safe_div(clicks * 100, impressions), 2)},
            "cpc": {"value": round(safe_div(spend, clicks), 2)},
            "leads": {"value": conversions},
            "cpl": {"value": round(safe_div(spend, conversions), 2)},
            "inversion": {"value": round(spend, 2)},
        }
    except Exception as exc:
        log.error("Google Ads KPIs failed: %s", exc)

    # --- 2. Daily breakdown ---
    try:
        query = f"""
            SELECT segments.date, metrics.impressions, metrics.clicks,
                   metrics.cost_micros, metrics.conversions
            FROM customer
            WHERE segments.date BETWEEN '{date_from}' AND '{date_to}'
        """
        rows = _google_query(client, cid, query, mcc_id)
        for r in rows:
            spend = r.metrics.cost_micros / 1_000_000
            leads = int(r.metrics.conversions)
            result["daily"].append(
                {
                    "date": r.segments.date,
                    "leads": leads,
                    "cpl": safe_div(spend, leads),
                    "impresiones": r.metrics.impressions,
                    "clics": r.metrics.clicks,
                    "inversion": round(spend, 2),
                }
            )
        result["daily"].sort(key=lambda d: d["date"])
    except Exception as exc:
        log.error("Google Ads daily failed: %s", exc)

    # --- 3. Campaign-level ---
    try:
        query = f"""
            SELECT campaign.name, metrics.impressions, metrics.clicks,
                   metrics.cost_micros, metrics.conversions, metrics.ctr,
                   metrics.average_cpc
            FROM campaign
            WHERE segments.date BETWEEN '{date_from}' AND '{date_to}'
              AND campaign.status = 'ENABLED'
        """
        rows = _google_query(client, cid, query, mcc_id)
        for r in rows:
            spend = r.metrics.cost_micros / 1_000_000
            leads = int(r.metrics.conversions)
            result["campaigns"].append(
                {
                    "name": r.campaign.name,
                    "impresiones": r.metrics.impressions,
                    "clics": r.metrics.clicks,
                    "ctr": round(r.metrics.ctr * 100, 2),
                    "cpc": round(r.metrics.average_cpc / 1_000_000, 2),
                    "leads": leads,
                    "cpl": safe_div(spend, leads),
                    "inversion": round(spend, 2),
                }
            )
    except Exception as exc:
        log.error("Google Ads campaigns failed: %s", exc)

    # --- 4. Keywords ---
    try:
        query = f"""
            SELECT ad_group_criterion.keyword.text, metrics.impressions,
                   metrics.clicks, metrics.cost_micros, metrics.conversions,
                   metrics.ctr, metrics.average_cpc
            FROM keyword_view
            WHERE segments.date BETWEEN '{date_from}' AND '{date_to}'
              AND campaign.status = 'ENABLED'
            ORDER BY metrics.impressions DESC
            LIMIT 50
        """
        rows = _google_query(client, cid, query, mcc_id)
        for r in rows:
            spend = r.metrics.cost_micros / 1_000_000
            leads = int(r.metrics.conversions)
            result["keywords"].append(
                {
                    "keyword": r.ad_group_criterion.keyword.text,
                    "impresiones": r.metrics.impressions,
                    "clics": r.metrics.clicks,
                    "ctr": round(r.metrics.ctr * 100, 2),
                    "cpc": round(r.metrics.average_cpc / 1_000_000, 2),
                    "leads": leads,
                    "cpl": safe_div(spend, leads),
                    "inversion": round(spend, 2),
                }
            )
    except Exception as exc:
        log.error("Google Ads keywords failed: %s", exc)

    # --- 5. Demographics: gender ---
    try:
        query = f"""
            SELECT ad_group_criterion.gender.type, metrics.conversions
            FROM gender_view
            WHERE segments.date BETWEEN '{date_from}' AND '{date_to}'
        """
        rows = _google_query(client, cid, query, mcc_id)
        for r in rows:
            result["demographics"]["gender"].append(
                {
                    "label": _gender_label(r.ad_group_criterion.gender.type),
                    "leads": int(r.metrics.conversions),
                }
            )
    except Exception as exc:
        log.error("Google Ads gender demographics failed: %s", exc)

    # --- 6. Demographics: age ---
    try:
        query = f"""
            SELECT ad_group_criterion.age_range_type, metrics.conversions
            FROM age_range_view
            WHERE segments.date BETWEEN '{date_from}' AND '{date_to}'
        """
        rows = _google_query(client, cid, query, mcc_id)
        for r in rows:
            result["demographics"]["age"].append(
                {
                    "label": _age_label(r.ad_group_criterion.age_range_type),
                    "leads": int(r.metrics.conversions),
                }
            )
    except Exception as exc:
        log.error("Google Ads age demographics failed: %s", exc)

    # --- 7. Monthly history ---
    try:
        today_str = datetime.now().strftime("%Y-%m-%d")
        query = f"""
            SELECT segments.month, metrics.impressions, metrics.clicks,
                   metrics.cost_micros, metrics.conversions, metrics.ctr,
                   metrics.average_cpc
            FROM customer
            WHERE segments.date BETWEEN '{HISTORY_START}' AND '{today_str}'
        """
        rows = _google_query(client, cid, query, mcc_id)
        for r in rows:
            spend = r.metrics.cost_micros / 1_000_000
            leads = int(r.metrics.conversions)
            result["monthly_history"].append(
                {
                    "month": r.segments.month,
                    "impresiones": r.metrics.impressions,
                    "clics": r.metrics.clicks,
                    "ctr": round(r.metrics.ctr * 100, 2),
                    "cpc": round(r.metrics.average_cpc / 1_000_000, 2),
                    "leads": leads,
                    "cpl": safe_div(spend, leads),
                    "inversion": round(spend, 2),
                }
            )
        result["monthly_history"].sort(key=lambda d: d["month"])
    except Exception as exc:
        log.error("Google Ads monthly history failed: %s", exc)

    return result


# ---------------------------------------------------------------------------
# HubSpot API
# ---------------------------------------------------------------------------

HUBSPOT_BASE = "https://api.hubapi.com"


def _hubspot_get(url: str, headers: dict, params: dict | None = None) -> dict:
    resp = requests.get(url, headers=headers, params=params or {}, timeout=60)
    resp.raise_for_status()
    return resp.json()


def _hubspot_post(url: str, headers: dict, payload: dict) -> dict:
    resp = requests.post(url, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    return resp.json()


def _hubspot_get_all_deals(
    headers: dict, pipeline_id: str, properties: list[str]
) -> list[dict]:
    """Search all deals in a pipeline with pagination."""
    deals: list[dict] = []
    after: str | None = None
    while True:
        body: dict[str, Any] = {
            "filterGroups": [
                {
                    "filters": [
                        {
                            "propertyName": "pipeline",
                            "operator": "EQ",
                            "value": pipeline_id,
                        }
                    ]
                }
            ],
            "properties": properties,
            "limit": 100,
        }
        if after:
            body["after"] = after
        data = _hubspot_post(
            f"{HUBSPOT_BASE}/crm/v3/objects/deals/search", headers, body
        )
        deals.extend(data.get("results", []))
        paging = data.get("paging", {})
        next_page = paging.get("next", {})
        after = next_page.get("after")
        if not after:
            break
    return deals


def _resolve_pipeline_id(headers: dict, pipeline_name: str) -> str | None:
    """Find a deals pipeline by name (case-insensitive partial match)."""
    data = _hubspot_get(
        f"{HUBSPOT_BASE}/crm/v3/pipelines/deals", headers
    )
    target = pipeline_name.lower().replace("_", " ")
    for p in data.get("results", []):
        label = p.get("label", "").lower()
        if target in label or label in target:
            return p["id"]
    # Fallback: return first pipeline
    results = data.get("results", [])
    if results:
        return results[0]["id"]
    return None


def _get_stage_map(headers: dict, pipeline_id: str) -> dict[str, str]:
    """Map stage ID -> stage label."""
    data = _hubspot_get(
        f"{HUBSPOT_BASE}/crm/v3/pipelines/deals/{pipeline_id}/stages", headers
    )
    return {s["id"]: s["label"] for s in data.get("results", [])}


def extract_hubspot(
    access_token: str,
    client_config: dict,
    date_from: str,
    date_to: str,
) -> dict:
    """Full HubSpot extraction for one client."""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    result: dict[str, Any] = {
        "pipeline": client_config["hubspot_pipeline"],
        "stages_current_month": {},
        "stages_total": {},
        "by_source": [],
        "monthly_history": [],
    }

    try:
        # Resolve pipeline
        pipeline_id = _resolve_pipeline_id(headers, client_config["hubspot_pipeline"])
        if not pipeline_id:
            log.error("Could not find HubSpot pipeline: %s", client_config["hubspot_pipeline"])
            return result

        # Get stage mapping
        stage_map = _get_stage_map(headers, pipeline_id)

        # Fetch all deals
        properties = [
            "dealstage",
            "createdate",
            "closedate",
            "hs_analytics_source",
            "hs_analytics_source_data_1",
            "amount",
        ]
        # Add visita property for Harmonices
        if client_config["id"] == "harmonices":
            properties.append("fecha_visita")

        deals = _hubspot_get_all_deals(headers, pipeline_id, properties)
        log.info("HubSpot: fetched %d deals for pipeline %s", len(deals), pipeline_id)

        # Parse dates for current month filter
        dt_from = datetime.strptime(date_from, "%Y-%m-%d")
        dt_to = datetime.strptime(date_to, "%Y-%m-%d")

        # Group by stage — current month
        current_month_stages: dict[str, int] = {}
        total_stages: dict[str, int] = {}
        source_stage: dict[str, dict[str, int]] = {}
        monthly_buckets: dict[str, dict[str, int]] = {}

        for deal in deals:
            props = deal.get("properties", {})
            stage_id = props.get("dealstage", "")
            stage_label = stage_map.get(stage_id, stage_id)
            create_raw = props.get("createdate", "")
            source = props.get("hs_analytics_source", "Unknown") or "Unknown"

            # Total (all-time)
            total_stages[stage_label] = total_stages.get(stage_label, 0) + 1

            # Parse create date
            if create_raw:
                try:
                    create_dt = datetime.fromisoformat(
                        create_raw.replace("Z", "+00:00")
                    ).replace(tzinfo=None)
                except ValueError:
                    create_dt = None
            else:
                create_dt = None

            # Current month
            if create_dt and dt_from <= create_dt <= dt_to + timedelta(days=1):
                current_month_stages[stage_label] = (
                    current_month_stages.get(stage_label, 0) + 1
                )
                # Source breakdown
                key = source
                if key not in source_stage:
                    source_stage[key] = {}
                source_stage[key][stage_label] = (
                    source_stage[key].get(stage_label, 0) + 1
                )

            # Monthly history
            if create_dt:
                m_key = create_dt.strftime("%Y-%m")
                if m_key not in monthly_buckets:
                    monthly_buckets[m_key] = {}
                monthly_buckets[m_key][stage_label] = (
                    monthly_buckets[m_key].get(stage_label, 0) + 1
                )

        result["stages_current_month"] = current_month_stages
        result["stages_total"] = total_stages

        # Source breakdown as list
        for src, stages in sorted(source_stage.items()):
            result["by_source"].append({"source": src, "stages": stages})

        # Monthly history as sorted list
        for m_key in sorted(monthly_buckets.keys()):
            entry = {"month": m_key}
            entry.update(monthly_buckets[m_key])
            result["monthly_history"].append(entry)

    except Exception as exc:
        log.error("HubSpot extraction failed: %s", exc)

    return result


# ---------------------------------------------------------------------------
# Merge previous-month deltas into KPIs
# ---------------------------------------------------------------------------

def _apply_previous(kpis: dict, prev_kpis: dict | None) -> dict:
    """Add 'previous' field to each KPI from last month's data."""
    if not prev_kpis:
        return kpis
    for key in kpis:
        if key in prev_kpis and isinstance(prev_kpis[key], dict):
            kpis[key]["previous"] = prev_kpis[key].get("value", 0)
    return kpis


# ---------------------------------------------------------------------------
# Build unified dashboard JSON
# ---------------------------------------------------------------------------

def build_dashboard_json(
    client: dict,
    meta_data: dict,
    google_data: dict,
    hubspot_data: dict,
    year: int,
    month: int,
) -> dict:
    """Assemble the final JSON structure."""
    first_day, last_day = month_range(year, month)
    month_str = f"{year}-{month:02d}"

    # Try to read previous month for deltas
    prev = read_previous_json(client["id"], year, month)
    if prev:
        prev_meta_kpis = prev.get("meta_ads", {}).get("kpis")
        prev_google_kpis = prev.get("google_ads", {}).get("kpis")
    else:
        prev_meta_kpis = None
        prev_google_kpis = None

    meta_data["kpis"] = _apply_previous(meta_data.get("kpis", {}), prev_meta_kpis)
    google_data["kpis"] = _apply_previous(google_data.get("kpis", {}), prev_google_kpis)

    return {
        "meta": {
            "clientId": client["id"],
            "clientName": client["name"],
            "month": month_str,
            "generatedAt": datetime.utcnow().isoformat() + "Z",
            "dateRange": {"from": first_day, "to": last_day},
        },
        "google_ads": google_data,
        "meta_ads": meta_data,
        "hubspot": hubspot_data,
    }


# ---------------------------------------------------------------------------
# Git commit helpers (for GitHub Actions environment)
# ---------------------------------------------------------------------------

def git_commit_and_push(month_str: str) -> None:
    """Stage data/ changes, commit, and push."""
    try:
        subprocess.run(
            ["git", "config", "user.email", "github-actions@github.com"],
            check=True,
        )
        subprocess.run(
            ["git", "config", "user.name", "GitHub Actions"],
            check=True,
        )
        subprocess.run(["git", "add", "data/"], check=True)

        # Check if there are staged changes
        diff = subprocess.run(
            ["git", "diff", "--cached", "--quiet"],
            capture_output=True,
        )
        if diff.returncode == 0:
            log.info("No changes to commit.")
            return

        subprocess.run(
            ["git", "commit", "-m", f"chore: update dashboard data {month_str}"],
            check=True,
        )
        subprocess.run(["git", "push"], check=True)
        log.info("Committed and pushed data for %s", month_str)
    except subprocess.CalledProcessError as exc:
        log.error("Git operation failed: %s", exc)
        raise


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    today = datetime.now()
    year, month = today.year, today.month
    month_str = f"{year}-{month:02d}"
    first_day, last_day = month_range(year, month)

    log.info(
        "Starting extraction for %s (date range: %s to %s)",
        month_str,
        first_day,
        last_day,
    )

    # Read env vars
    hubspot_token = os.environ.get("HUBSPOT_ACCESS_TOKEN", "")
    google_refresh = os.environ.get("GOOGLE_ADS_REFRESH_TOKEN", "")

    # Build Google Ads client once (if credentials available)
    google_client = None
    if google_refresh:
        try:
            google_client = _build_google_ads_client(login_customer_id="7270852417")
            log.info("Google Ads client initialized.")
        except Exception as exc:
            log.error("Failed to initialize Google Ads client: %s", exc)

    for client in CLIENTS:
        log.info("--- Processing client: %s ---", client["name"])

        # --- Meta ---
        meta_data: dict[str, Any] = {
            "kpis": {},
            "daily": [],
            "campaigns": [],
            "campaigns_by_platform": [],
            "creatives": [],
            "monthly_history": [],
        }
        meta_token = os.environ.get(client.get("meta_token_env", "META_ACCESS_TOKEN"), "")
        if meta_token:
            try:
                meta_data = extract_meta_ads(
                    client["meta_account_id"], meta_token, first_day, last_day
                )
                log.info("Meta extraction complete for %s.", client["id"])
            except Exception as exc:
                log.error("Meta extraction failed for %s: %s", client["id"], exc)
        else:
            log.warning("%s not set — skipping Meta extraction for %s.", client.get("meta_token_env"), client["id"])

        # --- Google Ads ---
        google_data: dict[str, Any] = {
            "kpis": {},
            "daily": [],
            "demographics": {"gender": [], "age": []},
            "campaigns": [],
            "keywords": [],
            "monthly_history": [],
        }
        if google_client:
            try:
                google_data = extract_google_ads(
                    google_client,
                    client["google_customer_id"],
                    client["google_mcc_id"],
                    first_day,
                    last_day,
                )
                log.info("Google Ads extraction complete for %s.", client["id"])
            except Exception as exc:
                log.error(
                    "Google Ads extraction failed for %s: %s", client["id"], exc
                )
        else:
            log.warning("Google Ads client unavailable — skipping.")

        # --- HubSpot ---
        hubspot_data: dict[str, Any] = {
            "pipeline": client["hubspot_pipeline"],
            "stages_current_month": {},
            "stages_total": {},
            "by_source": [],
            "monthly_history": [],
        }
        if hubspot_token:
            try:
                hubspot_data = extract_hubspot(
                    hubspot_token, client, first_day, last_day
                )
                log.info("HubSpot extraction complete for %s.", client["id"])
            except Exception as exc:
                log.error(
                    "HubSpot extraction failed for %s: %s", client["id"], exc
                )
        else:
            log.warning("HUBSPOT_ACCESS_TOKEN not set — skipping HubSpot extraction.")

        # --- Build and write JSON ---
        dashboard = build_dashboard_json(
            client, meta_data, google_data, hubspot_data, year, month
        )

        out_dir = Path("data") / client["id"]
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{month_str}.json"
        out_path.write_text(
            json.dumps(dashboard, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        log.info("Wrote %s", out_path)

    # --- Git commit ---
    git_commit_and_push(month_str)
    log.info("Done.")


if __name__ == "__main__":
    main()
