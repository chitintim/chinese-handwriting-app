package com.chitintim.moxie;

import android.content.Context;

import java.util.Locale;

/**
 * The interface language of the few texts the native side shows (docs/SPEC.md revision 22): "trad", "simp" or "en". The page tells it with
 * {@code MoBridge.setLang} whenever the user picks 繁 / 简 / EN; it is remembered here, so a toast or an error before the page has loaded
 * speaks the same language. Before the first choice the system locale decides (English -> en, zh-CN / zh-SG / zh-Hans -> simp, else trad).
 */
final class Lang {

    private static final String PREFS = "moxie";
    private static final String KEY = "lang";
    private static volatile String lang = null;

    private Lang() {
    }

    static boolean valid(String l) {
        return "trad".equals(l) || "simp".equals(l) || "en".equals(l);
    }

    /** Called by MoBridge.setLang. */
    static void set(Context c, String l) {
        if (!valid(l)) return;
        lang = l;
        try {
            c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, l).apply();
        } catch (Exception ignored) {
        }
    }

    static String of(Context c) {
        String l = lang;
        if (l == null && c != null) {
            try {
                String saved = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
                if (valid(saved)) l = saved;
            } catch (Exception ignored) {
            }
        }
        if (l == null) {
            Locale loc = Locale.getDefault();
            if ("zh".equals(loc.getLanguage())) {
                String country = loc.getCountry();
                l = "CN".equals(country) || "SG".equals(country) || "Hans".equals(loc.getScript()) ? "simp" : "trad";
            } else {
                l = "en".equals(loc.getLanguage()) ? "en" : "trad";
            }
        }
        lang = l;
        return l;
    }

    /** The text in the interface language: 繁, 简, English. */
    static String s(Context c, String trad, String simp, String en) {
        String l = of(c);
        return "en".equals(l) ? en : ("simp".equals(l) ? simp : trad);
    }
}
