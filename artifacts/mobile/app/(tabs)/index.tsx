import { useGetActiveQuests, useGetLogs } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const TYPE_LABELS: Record<string, string> = {
  play: "Play",
  stream: "Stream",
  achieve: "Achieve",
  grind: "Grind",
  session: "Session",
};

const DIFF_COLORS: Record<string, string> = {
  easy: "#54792a",
  medium: "#ad7400",
  hard: "#315f92",
  legendary: "#9b3e6f",
};

function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
}) {
  const colors = useColors();
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: colors.secondary }]}>{icon}</View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { data: logs, isLoading: logsLoading, refetch: refetchLogs } = useGetLogs();
  const { data: quests, isLoading: questsLoading, refetch: refetchQuests } = useGetActiveQuests();

  const isLoading = logsLoading || questsLoading;
  const isRefreshing = false;

  const today = useMemo(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  }, []);

  const todayLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter((l) => l.timestamp?.startsWith(today));
  }, [logs, today]);

  const totalMinutesToday = useMemo(
    () => todayLogs.reduce((sum, l) => sum + (l.minutes ?? 0), 0),
    [todayLogs]
  );

  const recentLogs = useMemo(() => {
    if (!logs) return [];
    return [...logs].reverse().slice(0, 6);
  }, [logs]);

  const activeCount = quests?.length ?? 0;

  const totalXp = useMemo(() => {
    if (!quests) return 0;
    return quests.reduce((sum, q) => sum + (q.xp_reward ?? 0), 0);
  }, [quests]);

  const dateLabel = useMemo(() => {
    return new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }, []);

  const topPad = isWeb ? 67 : insets.top;

  const onRefresh = () => {
    refetchLogs();
    refetchQuests();
  };

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: isWeb ? 34 : insets.bottom + 90 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={[styles.headerDate, { color: colors.mutedForeground }]}>{dateLabel}</Text>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Dashboard</Text>
      </View>

      <View style={styles.statsRow}>
        <StatCard
          icon={<Feather name="play" size={18} color={colors.primary} />}
          value={todayLogs.length}
          label="Today"
        />
        <StatCard
          icon={<Feather name="clock" size={18} color={colors.primary} />}
          value={totalMinutesToday > 0 ? `${totalMinutesToday}m` : "0m"}
          label="Minutes"
        />
        <StatCard
          icon={<Feather name="list" size={18} color={colors.primary} />}
          value={activeCount}
          label="Quests"
        />
        <StatCard
          icon={<Feather name="star" size={18} color={colors.primary} />}
          value={totalXp > 0 ? `${totalXp}` : "—"}
          label="XP Pool"
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
          RECENT SESSIONS
        </Text>
        {recentLogs.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="inbox" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No sessions logged yet
            </Text>
          </View>
        ) : (
          recentLogs.map((log) => (
            <View
              key={log.id}
              style={[styles.logCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.logLeft}>
                <Text style={[styles.logGame, { color: colors.foreground }]} numberOfLines={1}>
                  {log.game}
                </Text>
                <Text style={[styles.logAction, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {log.action}
                </Text>
              </View>
              <View style={styles.logRight}>
                <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.badgeText, { color: colors.primary }]}>
                    {log.minutes}m
                  </Text>
                </View>
                <Text style={[styles.logType, { color: colors.mutedForeground }]}>
                  {TYPE_LABELS[log.type] ?? log.type}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {activeCount > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            ACTIVE QUESTS
          </Text>
          {quests!.slice(0, 3).map((quest) => {
            const pct = Math.min(
              100,
              quest.target > 0 ? Math.round((quest.progress / quest.target) * 100) : 0
            );
            const diffColor = DIFF_COLORS[quest.difficulty] ?? colors.mutedForeground;
            return (
              <View
                key={quest.id}
                style={[styles.questCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.questHeader}>
                  <Text style={[styles.questGame, { color: colors.mutedForeground }]}>
                    {quest.game}
                  </Text>
                  <View style={[styles.diffBadge, { backgroundColor: diffColor + "22" }]}>
                    <Text style={[styles.diffText, { color: diffColor }]}>
                      {quest.difficulty}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.questTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {quest.title}
                </Text>
                <View style={styles.progressRow}>
                  <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { backgroundColor: colors.primary, width: `${pct}%` },
                      ]}
                    />
                  </View>
                  <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
                    {pct}%
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerDate: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 4 },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  section: { paddingHorizontal: 20, marginBottom: 28 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 36,
    borderRadius: 16,
    borderWidth: 1,
  },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  logCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  logLeft: { flex: 1, marginRight: 12 },
  logGame: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  logAction: { fontSize: 13, fontFamily: "Inter_400Regular" },
  logRight: { alignItems: "flex-end", gap: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  logType: { fontSize: 11, fontFamily: "Inter_400Regular" },
  questCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    gap: 6,
  },
  questHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  questGame: { fontSize: 12, fontFamily: "Inter_500Medium" },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  diffText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  questTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  progressTrack: { flex: 1, height: 6, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  progressLabel: { fontSize: 12, fontFamily: "Inter_500Medium", width: 36, textAlign: "right" },
});
