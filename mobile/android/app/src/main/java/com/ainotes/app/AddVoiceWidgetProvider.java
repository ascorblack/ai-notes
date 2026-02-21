package com.ainotes.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/**
 * App Widget: tap to open AI Notes for adding a voice note.
 * Launches MainActivity with ainotes://add-voice so the app can focus the input area.
 */
public class AddVoiceWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setData(Uri.parse("ainotes://add-voice"));
            intent.setPackage(context.getPackageName());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

            PendingIntent pending = PendingIntent.getActivity(
                    context, 0, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_add_voice);
            views.setOnClickPendingIntent(R.id.widget_root, pending);

            appWidgetManager.updateAppWidget(id, views);
        }
    }
}
