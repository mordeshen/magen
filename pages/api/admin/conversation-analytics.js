import { getAdminSupabase } from "../lib/supabase-admin";
import { authenticateDashboard } from "../lib/dashboard-auth";

export default async function handler(req, res) {
  const auth = await authenticateDashboard(req, res);
  if (auth.error) {
    const code = auth.error === "not_authenticated" ? 401 : 403;
    return res.status(code).json({ error: auth.error });
  }

  const admin = getAdminSupabase();
  const view = req.query.view || "summary";
  const days = Math.min(parseInt(req.query.days) || 30, 90);

  try {
    switch (view) {
      case "overview": {
        const today = new Date().toISOString().split("T")[0];
        const [todayEvents, incidents, weekEvents] = await Promise.all([
          admin.from("analytics_conversation_events")
            .select("*", { count: "exact", head: true })
            .gte("created_at", today),
          admin.from("analytics_critical_incidents")
            .select("*", { count: "exact", head: true })
            .eq("status", "new"),
          admin.from("analytics_conversation_events")
            .select("resolved, sentiment_score, response_time_ms")
            .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
        ]);

        const weekData = weekEvents.data || [];
        const totalWeek = weekData.length;
        const resolvedWeek = weekData.filter(e => e.resolved).length;
        const avgSentiment = weekData.length
          ? weekData.reduce((s, e) => s + (e.sentiment_score || 0), 0) / weekData.length
          : 0;
        const avgResponseTime = weekData.filter(e => e.response_time_ms).length
          ? Math.round(weekData.filter(e => e.response_time_ms).reduce((s, e) => s + e.response_time_ms, 0) / weekData.filter(e => e.response_time_ms).length)
          : 0;

        return res.json({
          today_conversations: todayEvents.count || 0,
          active_incidents: incidents.count || 0,
          week_total: totalWeek,
          week_resolved: resolvedWeek,
          resolution_rate: totalWeek ? Math.round((resolvedWeek / totalWeek) * 100) : 0,
          avg_sentiment: Math.round(avgSentiment * 100) / 100,
          avg_response_time_ms: avgResponseTime,
        });
      }

      case "topics": {
        const cutoff = new Date(Date.now() - days * 86400000).toISOString();
        const prevCutoff = new Date(Date.now() - days * 2 * 86400000).toISOString();

        const [current, previous] = await Promise.all([
          admin.from("analytics_conversation_events")
            .select("topic_category")
            .gte("created_at", cutoff),
          admin.from("analytics_conversation_events")
            .select("topic_category")
            .gte("created_at", prevCutoff)
            .lt("created_at", cutoff),
        ]);

        const currentCounts = {};
        (current.data || []).forEach(e => {
          currentCounts[e.topic_category] = (currentCounts[e.topic_category] || 0) + 1;
        });
        const prevCounts = {};
        (previous.data || []).forEach(e => {
          prevCounts[e.topic_category] = (prevCounts[e.topic_category] || 0) + 1;
        });

        const topics = Object.entries(currentCounts)
          .map(([topic, count]) => ({
            topic,
            count,
            prev_count: prevCounts[topic] || 0,
            trend: prevCounts[topic] ? Math.round(((count - prevCounts[topic]) / prevCounts[topic]) * 100) : 100,
          }))
          .sort((a, b) => b.count - a.count);

        return res.json({ topics });
      }

      case "temporal": {
        const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data } = await admin
          .from("analytics_conversation_events")
          .select("hour_of_day, day_of_week")
          .gte("created_at", cutoff);

        const hourly = Array.from({ length: 24 }, (_, h) => ({
          hour: h,
          count: (data || []).filter(e => e.hour_of_day === h).length,
        }));

        const daily = Array.from({ length: 7 }, (_, d) => ({
          day: d,
          count: (data || []).filter(e => e.day_of_week === d).length,
        }));

        return res.json({ hourly, daily });
      }

      case "incidents": {
        const status = req.query.status;
        let query = admin
          .from("analytics_critical_incidents")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);

        if (status) query = query.eq("status", status);

        const { data, error } = await query;
        if (error) throw error;
        return res.json({ incidents: data || [] });
      }

      case "sentiment": {
        const { data } = await admin
          .from("analytics_daily_stats")
          .select("date, avg_sentiment, total_conversations, critical_incidents_count")
          .order("date", { ascending: false })
          .limit(days);

        return res.json({ sentiment: (data || []).reverse() });
      }

      case "recurring": {
        const { data } = await admin
          .from("analytics_recurring_questions")
          .select("*")
          .order("occurrence_count", { ascending: false })
          .limit(20);

        return res.json({ questions: data || [] });
      }

      case "channels": {
        const cutoff = new Date(Date.now() - days * 86400000).toISOString();
        const { data } = await admin
          .from("analytics_conversation_events")
          .select("channel, created_at::date")
          .gte("created_at", cutoff);

        const byDate = {};
        (data || []).forEach(e => {
          const d = e.created_at;
          if (!byDate[d]) byDate[d] = { web: 0, whatsapp: 0 };
          byDate[d][e.channel] = (byDate[d][e.channel] || 0) + 1;
        });

        const channels = Object.entries(byDate)
          .map(([date, counts]) => ({ date, ...counts }))
          .sort((a, b) => a.date.localeCompare(b.date));

        const totals = (data || []).reduce((acc, e) => {
          acc[e.channel] = (acc[e.channel] || 0) + 1;
          return acc;
        }, { web: 0, whatsapp: 0 });

        return res.json({ channels, totals });
      }

      case "summary": {
        const today = new Date().toISOString().split("T")[0];
        const weekCutoff = new Date(Date.now() - 7 * 86400000).toISOString();
        const monthCutoff = new Date(Date.now() - 30 * 86400000).toISOString();
        const prevMonthCutoff = new Date(Date.now() - 60 * 86400000).toISOString();

        const [
          todayEvents,
          activeIncidents,
          weekEvents,
          monthTopics,
          prevMonthTopics,
          hourlyData,
          recentIncidents,
          sentimentTrend,
          recurringQs,
          channelData,
        ] = await Promise.all([
          admin.from("analytics_conversation_events")
            .select("*", { count: "exact", head: true })
            .gte("created_at", today),
          admin.from("analytics_critical_incidents")
            .select("*", { count: "exact", head: true })
            .eq("status", "new"),
          admin.from("analytics_conversation_events")
            .select("resolved, sentiment_score, response_time_ms, channel")
            .gte("created_at", weekCutoff),
          admin.from("analytics_conversation_events")
            .select("topic_category")
            .gte("created_at", monthCutoff),
          admin.from("analytics_conversation_events")
            .select("topic_category")
            .gte("created_at", prevMonthCutoff)
            .lt("created_at", monthCutoff),
          admin.from("analytics_conversation_events")
            .select("hour_of_day")
            .gte("created_at", weekCutoff),
          admin.from("analytics_critical_incidents")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(20),
          admin.from("analytics_daily_stats")
            .select("date, avg_sentiment, total_conversations, critical_incidents_count")
            .order("date", { ascending: false })
            .limit(30),
          admin.from("analytics_recurring_questions")
            .select("*")
            .order("occurrence_count", { ascending: false })
            .limit(20),
          admin.from("analytics_conversation_events")
            .select("channel")
            .gte("created_at", monthCutoff),
        ]);

        const week = weekEvents.data || [];
        const totalWeek = week.length;
        const resolvedWeek = week.filter(e => e.resolved).length;
        const avgSentiment = totalWeek
          ? week.reduce((s, e) => s + (e.sentiment_score || 0), 0) / totalWeek : 0;
        const validRT = week.filter(e => e.response_time_ms);
        const avgRT = validRT.length
          ? Math.round(validRT.reduce((s, e) => s + e.response_time_ms, 0) / validRT.length) : 0;

        const currentCounts = {};
        (monthTopics.data || []).forEach(e => {
          currentCounts[e.topic_category] = (currentCounts[e.topic_category] || 0) + 1;
        });
        const prevCounts = {};
        (prevMonthTopics.data || []).forEach(e => {
          prevCounts[e.topic_category] = (prevCounts[e.topic_category] || 0) + 1;
        });
        const topics = Object.entries(currentCounts)
          .map(([topic, count]) => ({
            topic, count,
            prev_count: prevCounts[topic] || 0,
            trend: prevCounts[topic] ? Math.round(((count - prevCounts[topic]) / prevCounts[topic]) * 100) : 100,
          }))
          .sort((a, b) => b.count - a.count);

        const hourly = Array.from({ length: 24 }, (_, h) => ({
          hour: h,
          count: (hourlyData.data || []).filter(e => e.hour_of_day === h).length,
        }));

        const channelTotals = (channelData.data || []).reduce((acc, e) => {
          acc[e.channel] = (acc[e.channel] || 0) + 1;
          return acc;
        }, { web: 0, whatsapp: 0 });

        return res.json({
          overview: {
            today_conversations: todayEvents.count || 0,
            active_incidents: activeIncidents.count || 0,
            week_total: totalWeek,
            resolution_rate: totalWeek ? Math.round((resolvedWeek / totalWeek) * 100) : 0,
            avg_sentiment: Math.round(avgSentiment * 100) / 100,
            avg_response_time_ms: avgRT,
          },
          topics,
          hourly,
          incidents: recentIncidents.data || [],
          sentiment: (sentimentTrend.data || []).reverse(),
          recurring: recurringQs.data || [],
          channels: channelTotals,
        });
      }

      default:
        return res.status(400).json({ error: "Unknown view" });
    }
  } catch (err) {
    console.error("[conv-analytics API] Error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
