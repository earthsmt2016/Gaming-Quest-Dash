import { useCreateLogs } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";

const DURATIONS = [15, 30, 45, 60, 90, 120];
const SESSION_TYPES = [
  { id: "play", label: "Play", icon: "play" },
  { id: "grind", label: "Grind", icon: "repeat" },
  { id: "achieve", label: "Achieve", icon: "award" },
  { id: "stream", label: "Stream", icon: "video" },
] as const;

export default function LogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const queryClient = useQueryClient();

  const [game, setGame] = useState<string>("");
  const [minutes, setMinutes] = useState<number>(30);
  const [type, setType] = useState<string>("play");
  const [action, setAction] = useState<string>("");
  const [success, setSuccess] = useState<boolean>(false);

  const { mutate: createLogs, isPending } = useCreateLogs({
    mutation: {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ["getLogs"] });
        setSuccess(true);
        setGame("");
        setAction("");
        setMinutes(30);
        setType("play");
        setTimeout(() => setSuccess(false), 3000);
      },
      onError: () => {
        Alert.alert("Error", "Failed to log session. Check your connection.");
      },
    },
  });

  const handleSubmit = () => {
    if (!game.trim()) {
      Alert.alert("Missing info", "Please enter a game name.");
      return;
    }
    const now = new Date().toISOString();
    createLogs({
      data: [
        {
          timestamp: now,
          game: game.trim(),
          action: action.trim() || `${type} session`,
          minutes,
          type,
        },
      ],
    });
  };

  const topPad = isWeb ? 67 : insets.top;
  const botPad = isWeb ? 34 : insets.bottom + 90;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: botPad }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>QUICK LOG</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Log Session</Text>
      </View>

      {success && (
        <View style={[styles.successBanner, { backgroundColor: colors.success + "22", borderColor: colors.success + "55" }]}>
          <Feather name="check-circle" size={18} color={colors.success} />
          <Text style={[styles.successText, { color: colors.success }]}>Session logged!</Text>
        </View>
      )}

      <View style={styles.form}>
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>GAME</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            placeholder="e.g. Elden Ring"
            placeholderTextColor={colors.mutedForeground}
            value={game}
            onChangeText={setGame}
            returnKeyType="next"
            testID="game-input"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>DURATION</Text>
          <View style={styles.chipRow}>
            {DURATIONS.map((d) => {
              const active = d === minutes;
              return (
                <Pressable
                  key={d}
                  onPress={() => {
                    setMinutes(d);
                    Haptics.selectionAsync();
                  }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.primary : colors.card,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  testID={`duration-${d}`}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? colors.primaryForeground : colors.foreground },
                    ]}
                  >
                    {d}m
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>TYPE</Text>
          <View style={styles.typeRow}>
            {SESSION_TYPES.map((t) => {
              const active = t.id === type;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    setType(t.id);
                    Haptics.selectionAsync();
                  }}
                  style={[
                    styles.typeBtn,
                    {
                      backgroundColor: active ? colors.primary : colors.card,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  testID={`type-${t.id}`}
                >
                  <Feather
                    name={t.icon as any}
                    size={18}
                    color={active ? colors.primaryForeground : colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.typeLabel,
                      { color: active ? colors.primaryForeground : colors.foreground },
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            NOTES <Text style={{ fontFamily: "Inter_400Regular" }}>(optional)</Text>
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            placeholder="What did you accomplish?"
            placeholderTextColor={colors.mutedForeground}
            value={action}
            onChangeText={setAction}
            multiline
            numberOfLines={3}
            returnKeyType="done"
            testID="notes-input"
          />
        </View>

        <Pressable
          onPress={handleSubmit}
          disabled={isPending}
          style={({ pressed }) => [
            styles.submitBtn,
            {
              backgroundColor: colors.primary,
              opacity: pressed || isPending ? 0.75 : 1,
            },
          ]}
          testID="submit-log"
        >
          {isPending ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <>
              <Feather name="save" size={18} color={colors.primaryForeground} />
              <Text style={[styles.submitText, { color: colors.primaryForeground }]}>
                Log Session
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 24 },
  eyebrow: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  title: { fontSize: 28, fontFamily: "Inter_700Bold" },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  successText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  form: { paddingHorizontal: 20, gap: 24 },
  fieldGroup: { gap: 10 },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  input: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  textArea: {
    height: 90,
    paddingTop: 14,
    textAlignVertical: "top",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 56,
    alignItems: "center",
  },
  chipText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  typeRow: { flexDirection: "row", gap: 8 },
  typeBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  typeLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  submitBtn: {
    height: 54,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  submitText: { fontSize: 16, fontFamily: "Inter_700Bold" },
});
