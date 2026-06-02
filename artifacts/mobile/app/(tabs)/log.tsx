import { useCreateLogs, useRequestUploadUrl } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { fetch as expoFetch } from "expo/fetch";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
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
  const [screenshotUri, setScreenshotUri] = useState<string | null>(null);
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const [permission, requestPermission] = ImagePicker.useMediaLibraryPermissions();

  const { mutateAsync: requestUploadUrlAsync } = useRequestUploadUrl();

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
        setScreenshotUri(null);
        setScreenshotPath(null);
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
          screenshotPath: screenshotPath ?? undefined,
        },
      ],
    });
  };

  const pickAndUploadScreenshot = async () => {
    if (!permission) return;

    if (!permission.granted) {
      if (permission.status === "denied" && !permission.canAskAgain) {
        if (Platform.OS !== "web") {
          try {
            await Linking.openSettings();
          } catch {}
        }
        return;
      }
      const { granted } = await requestPermission();
      if (!granted) return;
    }

    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: false,
      });
    } catch {
      Alert.alert("Error", "Could not open photo library.");
      return;
    }

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setScreenshotUri(asset.uri);
    setScreenshotPath(null);
    setIsUploading(true);

    try {
      const fileName = asset.fileName ?? `screenshot-${Date.now()}.jpg`;
      const mimeType = asset.mimeType ?? "image/jpeg";
      const fileSize = asset.fileSize ?? 0;

      const { uploadURL, objectPath } = await requestUploadUrlAsync({
        data: { name: fileName, size: fileSize, contentType: mimeType },
      });

      const blobResponse = await expoFetch(asset.uri);
      const blob = await blobResponse.blob();
      await expoFetch(uploadURL, {
        method: "PUT",
        body: blob as unknown as BodyInit,
        headers: { "Content-Type": mimeType },
      });

      setScreenshotPath(objectPath);
    } catch {
      Alert.alert(
        "Upload failed",
        "Could not upload the screenshot. You can still log your session without it."
      );
      setScreenshotUri(null);
      setScreenshotPath(null);
    } finally {
      setIsUploading(false);
    }
  };

  const removeScreenshot = () => {
    setScreenshotUri(null);
    setScreenshotPath(null);
  };

  const topPad = isWeb ? 67 : insets.top;
  const botPad = isWeb ? 34 : insets.bottom + 90;

  const screenshotButtonLabel = (() => {
    if (!permission || permission.granted) return "Add Screenshot";
    if (permission.status === "denied" && !permission.canAskAgain) return "Open Settings";
    return "Add Screenshot";
  })();

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

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>SCREENSHOT</Text>

          {screenshotUri ? (
            <View style={[styles.thumbnailContainer, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Image
                source={{ uri: screenshotUri }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
              {isUploading && (
                <View style={styles.uploadOverlay}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.uploadOverlayText}>Uploading…</Text>
                </View>
              )}
              {!isUploading && (
                <View style={styles.thumbnailActions}>
                  {screenshotPath && (
                    <View style={[styles.uploadedBadge, { backgroundColor: colors.success + "22" }]}>
                      <Feather name="check-circle" size={13} color={colors.success} />
                      <Text style={[styles.uploadedBadgeText, { color: colors.success }]}>Saved</Text>
                    </View>
                  )}
                  <Pressable
                    onPress={removeScreenshot}
                    style={[styles.removeBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                    testID="remove-screenshot"
                  >
                    <Feather name="x" size={14} color={colors.foreground} />
                    <Text style={[styles.removeBtnText, { color: colors.foreground }]}>Remove</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ) : (
            <Pressable
              onPress={pickAndUploadScreenshot}
              style={({ pressed }) => [
                styles.screenshotBtn,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              testID="add-screenshot"
            >
              <Feather name="image" size={20} color={colors.mutedForeground} />
              <Text style={[styles.screenshotBtnText, { color: colors.mutedForeground }]}>
                {screenshotButtonLabel}
              </Text>
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={handleSubmit}
          disabled={isPending || isUploading}
          style={({ pressed }) => [
            styles.submitBtn,
            {
              backgroundColor: colors.primary,
              opacity: pressed || isPending || isUploading ? 0.75 : 1,
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
  screenshotBtn: {
    height: 80,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  screenshotBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  thumbnailContainer: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  thumbnail: {
    width: "100%",
    height: 180,
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  uploadOverlayText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  thumbnailActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  uploadedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  uploadedBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  removeBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
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
