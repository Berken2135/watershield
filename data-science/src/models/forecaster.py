"""WQI forecasting: Prophet (daily) and XGBoost (hourly direct multi-step).

Data is only ~60 days (Aug 17 – Oct 16 2024), so:
  - Prophet uses daily aggregates (61 rows; 48 train / 13 test)
  - XGBoost uses hourly aggregates (1441 rows) with direct multi-step targets
  - 30-day extrapolation is documented as out-of-distribution for Prophet
  - Winner is chosen by lowest 7-day RMSE (most data for this horizon)
"""

from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.config import DATA_OUTPUTS, DATA_PROCESSED, wqi_to_risk

warnings.filterwarnings("ignore")

DATA_OUTPUTS.mkdir(parents=True, exist_ok=True)

# ── Horizons ──────────────────────────────────────────────────────────────────

HORIZONS = {"7d": 7 * 24, "30d": 30 * 24}   # in hours (for hourly XGBoost)
HORIZONS_DAILY = {"7d": 7, "30d": 30}         # in days  (for daily Prophet)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    mask = y_true != 0
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100)


def _metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    mae  = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    mape = _mape(y_true, y_pred)
    return {"mae": round(mae, 4), "rmse": round(rmse, 4), "mape": round(mape, 4)}


def _risk(wqi: float) -> str:
    return wqi_to_risk(wqi)


# ── Data preparation ──────────────────────────────────────────────────────────

SENSOR_COLS = [
    "water_temp_c", "ph", "oxygen_mg_l", "conductivity_us_cm",
    "salinity_ppt", "tds_ppm", "air_temp_c", "air_humidity_pct", "air_pressure_hpa",
]


def prepare_hourly(path: Path) -> pd.DataFrame:
    """Load waterly_features.parquet, resample to hourly, forward-fill short gaps."""
    df = pd.read_parquet(path)
    agg = {col: "mean" for col in ["wqi"] + SENSOR_COLS if col in df.columns}
    hourly = (
        df.set_index("timestamp")
        .resample("1h")
        .agg(agg)
        .ffill(limit=3)          # fill gaps ≤ 3 h (sensor dropout)
        .dropna(subset=["wqi"])
        .reset_index()
    )
    return hourly


def _add_xgb_features(hourly: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """Add lag + rolling + time features on the hourly DataFrame."""
    h = hourly.copy().set_index("timestamp").sort_index()

    # WQI lags (at hourly resolution)
    for lag_h in [1, 24, 168]:
        h[f"wqi_lag_{lag_h}h"] = h["wqi"].shift(lag_h)

    # Rolling means on WQI
    for win_h in [6, 24, 168]:
        h[f"wqi_roll_{win_h}h"] = h["wqi"].rolling(win_h, min_periods=1).mean()

    # Time features
    h["hour"]        = h.index.hour
    h["day_of_week"] = h.index.dayofweek
    h["month"]       = h.index.month
    h["is_weekend"]  = (h["day_of_week"] >= 5).astype("int8")
    h["is_night"]    = ((h["hour"] < 6) | (h["hour"] >= 22)).astype("int8")

    feature_cols = (
        [c for c in SENSOR_COLS if c in h.columns]
        + [f"wqi_lag_{l}h" for l in [1, 24, 168]]
        + [f"wqi_roll_{w}h" for w in [6, 24, 168]]
        + ["hour", "day_of_week", "month", "is_weekend", "is_night"]
    )
    return h.reset_index(), feature_cols


# ── Prophet ───────────────────────────────────────────────────────────────────

def run_prophet(hourly: pd.DataFrame) -> dict | None:
    """Train Prophet on daily aggregates, evaluate, return result dict or None."""
    try:
        from prophet import Prophet
    except ImportError as exc:
        print(f"  [Prophet] import failed: {exc}")
        return None

    print("  [Prophet] Preparing daily aggregates …")
    daily = (
        hourly.set_index("timestamp")["wqi"]
        .resample("1D").mean()
        .ffill(limit=2)
        .dropna()
        .reset_index()
        .rename(columns={"timestamp": "ds", "wqi": "y"})
    )

    n = len(daily)
    split = int(n * 0.8)
    train_df = daily.iloc[:split]
    test_df  = daily.iloc[split:]
    print(f"  [Prophet] Daily rows: {n}  |  train={split}, test={n-split}")

    model = Prophet(
        yearly_seasonality=False,   # only 2 months → no yearly signal
        weekly_seasonality=True,
        daily_seasonality=False,    # daily granularity → no intra-day
        seasonality_mode="additive",
        interval_width=0.90,
    )

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model.fit(train_df)

    results: dict = {"metrics": {}, "predictions": {}}

    for horizon_name, horizon_days in HORIZONS_DAILY.items():
        future = model.make_future_dataframe(periods=horizon_days, freq="D",
                                              include_history=True)
        forecast = model.predict(future)

        # Test-set evaluation (overlap with test_df)
        forecast_indexed = forecast.set_index("ds")[["yhat", "yhat_lower", "yhat_upper"]]
        eval_df = test_df.set_index("ds").join(forecast_indexed, how="inner")

        if len(eval_df) == 0:
            print(f"  [Prophet] No overlap for {horizon_name} evaluation — skipping")
            continue

        m = _metrics(eval_df["y"].values, eval_df["yhat"].values)
        results["metrics"][horizon_name] = m
        print(f"  [Prophet] {horizon_name}: MAE={m['mae']:.2f}  RMSE={m['rmse']:.2f}  MAPE={m['mape']:.2f}%")

    # Future forecast: next 30 days after the last data point
    future_30 = model.make_future_dataframe(periods=30, freq="D", include_history=False)
    forecast_30 = model.predict(future_30)
    results["future_forecast"] = forecast_30[["ds", "yhat", "yhat_lower", "yhat_upper"]]
    results["model"] = model

    return results


# ── XGBoost ───────────────────────────────────────────────────────────────────

def run_xgboost(hourly: pd.DataFrame) -> dict:
    """Train one XGBoost model per horizon using direct multi-step approach."""
    from xgboost import XGBRegressor

    print("  [XGBoost] Building hourly feature matrix …")
    h, feat_cols = _add_xgb_features(hourly)

    results: dict = {"metrics": {}, "models": {}, "predictions": {}}

    for horizon_name, horizon_h in HORIZONS.items():
        print(f"  [XGBoost] Training {horizon_name} model (target: WQI +{horizon_h}h) …")

        h[f"target_{horizon_name}"] = h["wqi"].shift(-horizon_h)
        valid = h.dropna(subset=feat_cols + [f"target_{horizon_name}"])

        X = valid[feat_cols].values
        y = valid[f"target_{horizon_name}"].values

        split = int(len(valid) * 0.8)
        X_train, X_test = X[:split], X[split:]
        y_train, y_test = y[:split], y[split:]

        print(f"    train={split:,}, test={len(X_test):,}")

        model = XGBRegressor(
            n_estimators=400,
            max_depth=5,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            n_jobs=-1,
            verbosity=0,
        )
        model.fit(X_train, y_train,
                  eval_set=[(X_test, y_test)],
                  verbose=False)

        pred = model.predict(X_test)
        m = _metrics(y_test, pred)
        results["metrics"][horizon_name] = m
        results["models"][horizon_name]  = model

        pred_df = valid.iloc[split:][["timestamp", "wqi"]].copy()
        pred_df["wqi_predicted"] = pred
        results["predictions"][horizon_name] = pred_df

        print(f"  [XGBoost] {horizon_name}: MAE={m['mae']:.2f}  RMSE={m['rmse']:.2f}  MAPE={m['mape']:.2f}%")

        # Drop temp target column before next iteration
        h = h.drop(columns=[f"target_{horizon_name}"])

    return results


# ── Forecast JSON (next 30 days, daily) ──────────────────────────────────────

def build_forecast_json(
    prophet_result: dict | None,
    xgb_result: dict,
    hourly: pd.DataFrame,
    winner: str,
) -> list[dict]:
    """Build the 30-day forecast JSON using the best available source."""
    end_date = hourly["timestamp"].max()

    if prophet_result and "future_forecast" in prophet_result:
        ff = prophet_result["future_forecast"]
        rmse_30d = prophet_result["metrics"].get("30d", {}).get("rmse", None)
        rows = []
        for _, row in ff.iterrows():
            wqi_pred = round(float(row["yhat"]), 1)
            rows.append({
                "date":          row["ds"].strftime("%Y-%m-%d"),
                "wqi_predicted": wqi_pred,
                "wqi_lower":     round(float(row["yhat_lower"]), 1),
                "wqi_upper":     round(float(row["yhat_upper"]), 1),
                "risk_level":    _risk(wqi_pred),
            })
        return rows[:30]

    # Fallback: XGBoost 30d model — single-shot prediction from last row
    if "30d" in xgb_result["models"]:
        h, feat_cols = _add_xgb_features(hourly)
        model_30d = xgb_result["models"]["30d"]
        last_features = h.dropna(subset=feat_cols).iloc[[-1]][feat_cols].values
        rmse = xgb_result["metrics"].get("30d", {}).get("rmse", 15.0)
        wqi_pred = float(model_30d.predict(last_features)[0])
        rows = []
        for i in range(30):
            date = (end_date + pd.Timedelta(days=i + 1)).strftime("%Y-%m-%d")
            rows.append({
                "date":          date,
                "wqi_predicted": round(wqi_pred, 1),
                "wqi_lower":     round(wqi_pred - 1.5 * rmse, 1),
                "wqi_upper":     round(wqi_pred + 1.5 * rmse, 1),
                "risk_level":    _risk(wqi_pred),
            })
        return rows

    return []


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    feat_path = DATA_PROCESSED / "waterly_features.parquet"
    print(f"Loading {feat_path.name} …")
    hourly = prepare_hourly(feat_path)
    print(f"Hourly rows: {len(hourly)}  |  {hourly['timestamp'].min().date()} → {hourly['timestamp'].max().date()}")

    # ── Prophet ───────────────────────────────────────────────────────────────
    print("\n── Prophet ──────────────────────────────────────────────────────────")
    prophet_result = run_prophet(hourly)

    # ── XGBoost ───────────────────────────────────────────────────────────────
    print("\n── XGBoost ──────────────────────────────────────────────────────────")
    xgb_result = run_xgboost(hourly)

    # Save XGBoost predictions
    for horizon_name, pred_df in xgb_result["predictions"].items():
        out = DATA_OUTPUTS / f"forecast_xgboost_{horizon_name}.parquet"
        pred_df.to_parquet(out, index=False)

    if prophet_result:
        ff = prophet_result.get("future_forecast")
        if ff is not None:
            # rename a copy — do NOT mutate the original; build_forecast_json reads it later
            ff.rename(columns={"ds": "timestamp", "yhat": "wqi_predicted",
                                "yhat_lower": "wqi_lower", "yhat_upper": "wqi_upper"}) \
              .to_parquet(DATA_OUTPUTS / "forecast_prophet.parquet", index=False)

    # ── Metrics comparison ────────────────────────────────────────────────────
    print("\n── Metrics comparison ───────────────────────────────────────────────")
    all_metrics: dict = {}
    if prophet_result:
        all_metrics["prophet"] = prophet_result["metrics"]
    all_metrics["xgboost"] = xgb_result["metrics"]

    header = f"{'Model':<12}{'Horizon':<8}{'MAE':>8}{'RMSE':>8}{'MAPE%':>8}"
    print(header)
    print("─" * len(header))
    for model_name, horizons in all_metrics.items():
        for hor, m in horizons.items():
            print(f"{model_name:<12}{hor:<8}{m['mae']:>8.2f}{m['rmse']:>8.2f}{m['mape']:>8.2f}")

    # ── Pick winner (lowest 7d RMSE) ──────────────────────────────────────────
    best_model = "xgboost"
    best_rmse  = xgb_result["metrics"].get("7d", {}).get("rmse", float("inf"))
    if prophet_result and "7d" in prophet_result["metrics"]:
        p_rmse = prophet_result["metrics"]["7d"]["rmse"]
        if p_rmse < best_rmse:
            best_model = "prophet"
            best_rmse  = p_rmse

    print(f"\nWinner: {best_model.upper()} (7d RMSE = {best_rmse:.2f})")

    # Save winner model
    if best_model == "xgboost":
        winner_model_obj = xgb_result["models"]["7d"]
    else:
        winner_model_obj = prophet_result["model"]

    winner_path = DATA_OUTPUTS / "model_winner.pkl"
    joblib.dump(winner_model_obj, winner_path)
    print(f"Saved winner → {winner_path}")

    # ── 30-day WQI forecast JSON (must run before Prophet df gets renamed) ──────
    forecast_rows = build_forecast_json(prophet_result, xgb_result, hourly, best_model)

    # ── Metrics JSON ──────────────────────────────────────────────────────────
    metrics_out = {
        "models": all_metrics,
        "winner": best_model,
        "winner_7d_rmse": round(best_rmse, 4),
        "note": (
            "30-day extrapolation is out-of-distribution for a 60-day training set. "
            "Treat 30d predictions as directional estimates only."
        ),
    }
    metrics_path = DATA_OUTPUTS / "forecast_metrics.json"
    with metrics_path.open("w") as f:
        json.dump(metrics_out, f, indent=2)
    print(f"Saved metrics → {metrics_path}")
    forecast_path = DATA_OUTPUTS / "wqi_forecast_30d.json"
    with forecast_path.open("w") as f:
        json.dump(forecast_rows, f, indent=2)
    print(f"Saved 30d forecast → {forecast_path}  ({len(forecast_rows)} days)")

    # ── Final summary ─────────────────────────────────────────────────────────
    print("\n── Final summary ────────────────────────────────────────────────────")
    print(f"  Winner model         : {best_model.upper()}")
    print(f"  7-day forecast RMSE  : {best_rmse:.2f} WQI points")
    if forecast_rows:
        next7 = forecast_rows[:7]
        avg7d = sum(r["wqi_predicted"] for r in next7) / len(next7)
        risk7d = _risk(avg7d)
        print(f"  7-day WQI outlook    : mean={avg7d:.1f}  risk='{risk7d}'")
        print("  Next 7 days:")
        for r in next7:
            print(f"    {r['date']}  WQI={r['wqi_predicted']:6.1f}  [{r['risk_level']}]")


if __name__ == "__main__":
    main()
