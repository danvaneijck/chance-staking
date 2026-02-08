import React from 'react'
import { INJ_DECIMALS } from '../config'

/**
 * Smart number formatter with K/M/B/T suffixes and subscript zero notation
 * for very small numbers.
 */
export function formatNumber(x: number, extra: number = 2) {
    const num = x ?? 0;
    const suffixes = ["", "K", "M", "B", "T"];
    const isNeg = num < 0;
    let abs = Math.abs(num);

    /* tiny but non-zero: render 0.0_n... with "extra" significant digits */
    if (abs !== 0 && abs < 1e-2) {
        return smallNumberWithZeroCount({ value: num, digits: extra });
    }

    /* thousands-separator + K/M/B/T suffix */
    let i = 0;
    while (abs >= 1_000 && i < suffixes.length - 1) {
        abs /= 1_000;
        i++;
    }

    const formatted = abs.toLocaleString(undefined, {
        maximumFractionDigits: extra,
    });
    return (isNeg ? "-" : "") + formatted + suffixes[i];
}

/* -------- helper -------- */
function smallNumberWithZeroCount(
    {
        value,
        digits = 2,
    }: {
        value: number;
        digits?: number;
    }
) {
    if (value === 0 || Math.abs(value) >= 1e-2) {
        return <span>{value.toLocaleString()}</span>;
    }

    const abs = Math.abs(value);
    const precision = Math.ceil(-Math.log10(abs)) + digits + 2;
    const fixed = abs.toFixed(Math.min(precision, 100)).replace(/0+$/, "").replace(/\.$/, "");
    const [, frac = ""] = fixed.split(".");
    const zeroRun = frac.match(/^0*/)?.[0].length ?? 0;
    const sig = frac.slice(zeroRun);

    return (
        <span className="inline-flex items-baseline">
            {value < 0 && "-"}0.0
            {zeroRun > 0 && (
                <sub className="text-xs" style={{ lineHeight: 1 }}>
                    {zeroRun}
                </sub>
            )}
            {sig.slice(0, digits)}
        </span>
    );
}

/**
 * Format a raw on-chain amount (string with 18 decimals) to a human-readable
 * number using the smart formatter.
 */
export function formatInj(raw: string, extra: number = 2): string | React.ReactElement {
    const n = parseFloat(raw) / 10 ** INJ_DECIMALS;
    return formatNumber(n, extra);
}

/**
 * Format a raw on-chain amount to a plain string (no JSX).
 * Used where a string is required (e.g. title attributes).
 */
export function formatInjString(raw: string, decimals: number = 4): string {
    const n = parseFloat(raw) / 10 ** INJ_DECIMALS;
    return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}
