import {
  useGetActiveQuests,
  useUpdateQuestProgress,
  type Quest,
} from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";

const DIFF_COLORS: Record<string, string> = {
  easy: "#54792a",
  medium: "#ad7400",
  hard: "#315f92",
  legendary: "#9b3e6f",
};

const TYPE_ICONS: Record<string, string> = {
  challenge: "zap",
  exploration: "compass",
  grind: "repeat",
  skill: "trending-up",
};

function QuestCard({ quest }: { quest: Quest }) {
  const colors = useColors();
  const queryClient = useQueryClient();

  const { mutate: updateProgress, isPending } = useUpdateQuestProgress({
    mutation: {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ["getActiveQuests"] });
      },
      onError: () => {
        Alert.alert("Error", "Could not update progress.");
      },
    },
  });

  const pct = quest.target > 0
    ? Math.min(100, Math.round((quest.progress / quest.target) * 100))
    : 0;

  const diffColor = DIFF_COLORS[quest.difficulty] ?? colors.mutedForeground;
  const typeIcon = (TYPE_ICONS[quest.type] ?? "list") as any;

  const handleIncrement = () => {
    const amount = Math.max(1, Math.round(quest.target * 0.1));
    updateProgress({ id: quest.id, data: { amount } });
  };

  return (
    <View
      style={[styles.questCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      testID={`quest-card-${quest.id}`}
    >
      <View style={styles.questTopRow}>
        <View style={styles.questMeta}>
          <View style={[styles.typeIcon, { backgroundColor: colors.secondary }]}>
            <Feather name={typeIcon} size={14} color={colors.primary} />
          </View>
          <Text style={[styles.questGame, { color: colors.mutedForeground }]}>{quest.game}</Text>
        </View>
        <View style={[styles.diffPill, { backgroundColor: diffColor + "22" }]}>
          <Text style={[styles.diffText, { color: diffColor }]}>{quest.difficulty}</Text>
        </View>
      </View>

      <Text style={[styles.questTitle, { color: colors.foreground }]} numberOfLines={2}>
        {quest.title}
      </Text>
      <Text style={[styles.questDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
        {quest.description}
      </Text>

      <View style={styles.progressSection}>
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: pct >= 100 ? colors.success : colors.primary,
                width: `${pct}%`,
              },
            ]}
          />
        </View>
        <View style={styles.progressMeta}>
          <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
            {quest.progress} / {quest.target}
          </Text>
          <Text style={[styles.pctText, { color: pct >= 100 ? colors.success : colors.primary }]}>
            {pct}%
          </Text>
        </View>
      </View>

      <View style={styles.questFooter}>
        <View style={[styles.xpBadge, { backgroundColor: colors.secondary }]}>
          <Feather name="star" size={12} color={colors.primary} />
          <Text style={[styles.xpText, { color: colors.primary }]}>{quest.xp_reward} XP</Text>
        </View>
        <View style={[styles.timeBadge, { backgroundColor: colors.muted }]}>
          <Feather name="clock" size={12} color={colors.mutedForeground} />
          <Text style={[styles.timeText, { color: colors.mutedForeground }]}>
            ~{quest.estimated_minutes}m
          </Text>
        </View>
        <Pressable
          onPress={handleIncrement}
          disabled={isPending || pct >= 100}
          style={({ pressed }) => [
            styles.progressBtn,
            {
              backgroundColor: pct >= 100 ? colors.success + "22" : colors.primary,
              opacity: pressed || isPending ? 0.7 : 1,
            },
          ]}
          testID={`progress-btn-${quest.id}`}
        >
          {isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather
              name={pct >= 100 ? "check" : "plus"}
              size={16}
              color={pct >= 100 ? colors.success : "#fff"}
            />
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default function QuestsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const {
    data: quests,
    isLoading,
    refetch,
    isRefetching,
  } = useGetActiveQuests();

  const topPad = isWeb ? 67 : insets.top;
  const botPad = isWeb ? 34 : insets.bottom + 90;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: botPad }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={colors.primary}
        />
      }
    >
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>YOUR JOURNEY</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Active Quests</Text>
        {(quests?.length ?? 0) > 0 && (
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {quests!.length} quest{quests!.length !== 1 ? "s" : ""} in progress
          </Text>
        )}
      </View>

      <View style={styles.list}>
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : !quests || quests.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="list" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No active quests</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Accept quests from the web dashboard to start your journey
            </Text>
          </View>
        ) : (
          quests.map((quest) => <QuestCard key={quest.id} quest={quest} />)
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  eyebrow: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: 4 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 4 },
  list: { paddingHorizontal: 20, gap: 12 },
  centered: { alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  emptyCard: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 48,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
  },
  questCard: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
  },
  questTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  questMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  typeIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  questGame: { fontSize: 12, fontFamily: "Inter_500Medium" },
  diffPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  diffText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  questTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", lineHeight: 23 },
  questDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  progressSection: { gap: 6 },
  progressTrack: { height: 8, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  progressMeta: { flexDirection: "row", justifyContent: "space-between" },
  progressText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  pctText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  questFooter: { flexDirection: "row", alignItems: "center", gap: 8 },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  xpText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  timeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  timeText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  progressBtn: {
    marginLeft: "auto",
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});
