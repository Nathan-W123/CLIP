import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusPill, SectionHeader } from '../src/components/ui';
import { Colors } from '../src/components/ui/colors';
import { Type } from '../src/components/ui/typography';
import {
  createMockProject,
  formatProjectSubtitle,
  getMockProjects,
  groupProjectsByLastUsed,
  sortProjectsByLastUsed,
} from '../src/components/mock';
import { Images } from '../src/assets/images';
import { SyncStatus } from '../src/components/SyncStatus';
import type { MockProject } from '../src/components/mock';
import type { DatabaseTemplateOption } from '../src/db/templateSchemas';
import { listDatabaseTemplateOptions } from '../src/db/templateSchemas';
import { syncTemplateCatalogFromSupabase } from '../src/services/syncTemplateCatalog';

function ProjectIcon({ color, size = 46 }: { color: string; size?: number }) {
  const starSize = Math.round(size * 0.52);

  return (
    <View
      style={[
        iconStyles.wrap,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.22),
          backgroundColor: color,
        },
      ]}
    >
      <Images.ProjectStarIcon width={starSize} height={starSize + 1} />
    </View>
  );
}

const iconStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});

function getIconColor(project: MockProject, featured = false): string {
  if (featured) return Colors.orangeLight;
  if (project.type === 'data_collection') return Colors.orange;
  if (project.isCompleted) return Colors.orangeDeep;
  return Colors.orangeDark;
}

function FeaturedProjectCard({
  project,
  onPress,
}: {
  project: MockProject;
  onPress: () => void;
}) {
  const activity = project.recentActivity?.slice(0, 3) ?? [];

  return (
    <Pressable
      style={({ pressed }) => [
        styles.featuredCard,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.projectHeader}>
        <ProjectIcon color={getIconColor(project, true)} />
        <View style={styles.projectMeta}>
          <Text style={styles.projectTitle} numberOfLines={1}>
            {project.title}
          </Text>
          <Text style={styles.projectSubtitle} numberOfLines={2}>
            {formatProjectSubtitle(project)}
          </Text>
        </View>
        <StatusPill status={project.syncStatus} />
      </View>

      <View style={styles.activityList}>
        {activity.length > 0 ? (
          activity.map(entry => (
            <View key={entry.id} style={styles.activityRow}>
              <Text style={styles.activityText} numberOfLines={1}>
                {entry.label}
              </Text>
            </View>
          ))
        ) : (
          <View style={styles.activityRow}>
            <Text style={styles.activityText} numberOfLines={1}>
              No captures yet
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function ProjectRow({
  project,
  onPress,
}: {
  project: MockProject;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.projectRow, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <ProjectIcon color={getIconColor(project)} />
      <View style={styles.projectMeta}>
        <Text style={styles.projectTitle} numberOfLines={1}>
          {project.title}
        </Text>
        <Text style={styles.projectSubtitle} numberOfLines={2}>
          {formatProjectSubtitle(project)}
        </Text>
      </View>
      <StatusPill status={project.syncStatus} />
    </Pressable>
  );
}

function CreateProjectSheet({
  visible,
  progress,
  onClose,
  dbTemplates,
  templatesLoading,
  onCreateChecklist,
  onCreateDataWithTemplate,
  onCreateGenericDataCollection,
}: {
  visible: boolean;
  progress: Animated.Value;
  onClose: () => void;
  dbTemplates: DatabaseTemplateOption[];
  templatesLoading: boolean;
  onCreateChecklist: () => void;
  onCreateDataWithTemplate: (t: DatabaseTemplateOption) => void;
  onCreateGenericDataCollection: () => void;
}) {
  const [phase, setPhase] = useState<'type' | 'database'>('type');

  useEffect(() => {
    if (!visible) setPhase('type');
  }, [visible]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [560, 0],
  });

  return (
    <>
      {visible ? <Pressable style={styles.sheetScrim} onPress={onClose} /> : null}
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[styles.createSheet, { transform: [{ translateY }] }]}
      >
        {phase === 'type' ? (
          <>
            <View style={styles.sheetTitleRow}>
              <Text style={styles.sheetTitle}>Create Project</Text>
              <Image source={Images.clipLogo} style={{ width: 32, height: 34 }} resizeMode="contain" />
            </View>
            <View style={styles.createOptions}>
              <CreateOption
                label="Checklist"
                imageSource={Images.checklistIcon}
                onPress={onCreateChecklist}
              />
              <CreateOption
                label="Data Collection"
                imageSource={Images.dataCollectionIcon}
                onPress={() => setPhase('database')}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.sheetTitleRow}>
              <Pressable
                onPress={() => setPhase('type')}
                hitSlop={12}
                style={({ pressed }) => [styles.sheetBackBtn, pressed && styles.cardPressed]}
              >
                <Text style={styles.sheetBackLabel}>Back</Text>
              </Pressable>
              <Text style={[styles.sheetTitle, styles.sheetTitleFlex]}>Choose database</Text>
              <View style={{ width: 48 }} />
            </View>
            <ScrollView
              style={styles.databaseScroll}
              contentContainerStyle={styles.databaseScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {templatesLoading ? (
                <View style={styles.templatesLoading}>
                  <ActivityIndicator color={Colors.orange} size="small" />
                  <Text style={styles.templatesLoadingText}>Syncing templates…</Text>
                </View>
              ) : dbTemplates.length === 0 ? (
                <Text style={styles.templatesEmpty}>
                  No database templates found. Open the app online once so Supabase templates sync to
                  this device.
                </Text>
              ) : (
                <View style={styles.databaseList}>
                  {dbTemplates.map(t => (
                    <Pressable
                      key={t.id}
                      style={({ pressed }) => [styles.databaseRow, pressed && styles.cardPressed]}
                      onPress={() => onCreateDataWithTemplate(t)}
                    >
                      <Text style={styles.databaseRowTitle} numberOfLines={2}>
                        {t.displayName}
                      </Text>
                      <Text style={styles.databaseRowHint} numberOfLines={1}>
                        {t.masterSchemaId}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <Pressable
                style={({ pressed }) => [styles.genericDataRow, pressed && styles.cardPressed]}
                onPress={onCreateGenericDataCollection}
              >
                <Text style={styles.genericDataTitle}>Generic data collection</Text>
                <Text style={styles.genericDataHint}>No database template — unstructured captures</Text>
              </Pressable>
            </ScrollView>
          </>
        )}
      </Animated.View>
    </>
  );
}

function CreateOption({
  label,
  imageSource,
  onPress,
}: {
  label: string;
  imageSource: ImageSourcePropType;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.createOption, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <Text style={styles.createOptionLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.createOptionImageWrap}>
        <Image source={imageSource} style={styles.createOptionImage} resizeMode="contain" />
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const sheetProgress = useRef(new Animated.Value(0)).current;
  const [projects, setProjects] = useState(() => getMockProjects());
  const [query, setQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [dbTemplates, setDbTemplates] = useState<DatabaseTemplateOption[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  useEffect(() => {
    if (!isCreateOpen) return;
    let cancelled = false;
    setTemplatesLoading(true);
    void (async () => {
      try {
        await syncTemplateCatalogFromSupabase(db);
        const rows = await listDatabaseTemplateOptions(db);
        if (!cancelled) setDbTemplates(rows);
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isCreateOpen, db]);

  useFocusEffect(
    useCallback(() => {
      setProjects(getMockProjects());
    }, []),
  );

  useEffect(() => {
    Animated.timing(sheetProgress, {
      toValue: isCreateOpen ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [isCreateOpen, sheetProgress]);

  const orderedProjects = useMemo(
    () => sortProjectsByLastUsed(projects),
    [projects],
  );
  const featuredProjectId = orderedProjects[0]?.id;
  const groupedProjects = useMemo(
    () => groupProjectsByLastUsed(projects),
    [projects],
  );

  const searchResults: MockProject[] | null = query.trim()
    ? sortProjectsByLastUsed(
        projects.filter(
          project =>
            project.title.toLowerCase().includes(query.toLowerCase()) ||
            (project.description ?? '').toLowerCase().includes(query.toLowerCase()),
        ),
      )
    : null;

  const navigateTo = (id: string) => {
    router.push(`/project/${id}` as never);
  };

  const finishCreateAndNavigate = (project: MockProject) => {
    setProjects(getMockProjects());
    setQuery('');
    setIsCreateOpen(false);
    router.push(`/project/${project.id}` as never);
  };

  const handleCreateChecklist = () => {
    finishCreateAndNavigate(createMockProject('checklist'));
  };

  const handleCreateDataWithTemplate = (t: DatabaseTemplateOption) => {
    finishCreateAndNavigate(
      createMockProject('data_collection', {
        masterSchemaId: t.masterSchemaId,
        title: t.displayName,
        description: `${t.displayName} — database template`,
      }),
    );
  };

  const handleCreateGenericDataCollection = () => {
    finishCreateAndNavigate(createMockProject('data_collection'));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderRow}>
            <Image source={Images.clipLogo} style={{ width: 28, height: 30 }} resizeMode="contain" />
            <Pressable
              onPress={() => router.push('/history' as never)}
              hitSlop={8}
              style={({ pressed }) => (pressed ? styles.historyLinkPressed : undefined)}
            >
              <Text style={styles.historyLink}>History</Text>
            </Pressable>
          </View>
          <SyncStatus />
          <Text style={styles.pageTitle}>Projects</Text>
        </View>

        {searchResults ? (
          <View style={styles.section}>
            <SectionHeader
              label={`${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}
              variant="section"
            />
            <View style={styles.projectStack}>
              {searchResults.map(project => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  onPress={() => navigateTo(project.id)}
                />
              ))}
            </View>
          </View>
        ) : (
          groupedProjects.map(group => (
            <View key={group.id} style={styles.section}>
              <SectionHeader label={group.label} variant="section" />
              <View style={styles.projectStack}>
                {group.projects.map(project =>
                  project.id === featuredProjectId ? (
                    <FeaturedProjectCard
                      key={project.id}
                      project={project}
                      onPress={() => navigateTo(project.id)}
                    />
                  ) : (
                    <ProjectRow
                      key={project.id}
                      project={project}
                      onPress={() => navigateTo(project.id)}
                    />
                  ),
                )}
              </View>
            </View>
          ))
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {!isCreateOpen ? (
        <View style={styles.bottomBar}>
          <View style={styles.searchWrap}>
            <View style={styles.searchIconBubble}>
              <Images.SearchIcon width={17} height={17} />
            </View>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor="#999"
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.createBtn,
              pressed && styles.createBtnPressed,
            ]}
            onPress={() => setIsCreateOpen(true)}
          >
            <Text style={styles.createIcon}>+</Text>
            <Text style={styles.createLabel}>Create</Text>
          </Pressable>
        </View>
      ) : null}

      <CreateProjectSheet
        visible={isCreateOpen}
        progress={sheetProgress}
        onClose={() => setIsCreateOpen(false)}
        dbTemplates={dbTemplates}
        templatesLoading={templatesLoading}
        onCreateChecklist={handleCreateChecklist}
        onCreateDataWithTemplate={handleCreateDataWithTemplate}
        onCreateGenericDataCollection={handleCreateGenericDataCollection}
      />
    </SafeAreaView>
  );
}

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.07,
  shadowRadius: 6,
  elevation: 2,
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.backgroundScreen,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: 110,
  },
  pageHeader: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 8,
    marginBottom: 8,
  },
  pageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: Colors.textPrimary,
    lineHeight: 40,
  },
  historyLink: {
    ...Type.subhead,
    color: Colors.textTertiary,
  },
  historyLinkPressed: {
    opacity: 0.5,
  },
  section: {
    paddingHorizontal: 24,
  },
  projectStack: {
    gap: 8,
  },
  cardPressed: {
    opacity: 0.72,
  },
  featuredCard: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 16,
    gap: 8,
    ...CARD_SHADOW,
  },
  projectRow: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...CARD_SHADOW,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  projectMeta: {
    flex: 1,
    gap: 3,
  },
  projectTitle: {
    ...Type.headline,
    color: Colors.textPrimary,
  },
  projectSubtitle: {
    ...Type.caption,
    color: Colors.textTertiary,
    lineHeight: 17,
  },
  activityList: {
    gap: 8,
  },
  activityRow: {
    backgroundColor: Colors.backgroundScreen,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  activityText: {
    ...Type.subhead,
    color: Colors.textSecondary,
  },
  bottomSpacer: {
    height: 24,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
    backgroundColor: Colors.backgroundScreen,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DEDEDE',
  },
  searchWrap: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: Colors.searchBlue,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    backgroundColor: Colors.background,
  },
  searchIconBubble: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    ...Type.body,
    color: Colors.textPrimary,
    padding: 0,
  },
  createBtn: {
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.orange,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  createBtnPressed: {
    backgroundColor: Colors.orangeDark,
  },
  createIcon: {
    fontSize: 18,
    lineHeight: 20,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  createLabel: {
    ...Type.bodyMedium,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  sheetScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  createSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    backgroundColor: Colors.background,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 10,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetBackBtn: {
    paddingVertical: 8,
    paddingRight: 8,
  },
  sheetBackLabel: {
    ...Type.bodyMedium,
    color: Colors.orange,
    fontWeight: '600',
  },
  sheetTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  sheetTitleFlex: {
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  databaseScroll: {
    maxHeight: 360,
  },
  databaseScrollContent: {
    gap: 8,
    paddingBottom: 8,
  },
  templatesLoading: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  templatesLoadingText: {
    ...Type.subhead,
    color: Colors.textTertiary,
  },
  templatesEmpty: {
    ...Type.body,
    color: Colors.textSecondary,
    lineHeight: 22,
    paddingVertical: 16,
  },
  databaseList: {
    gap: 8,
  },
  databaseRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.backgroundScreen,
    paddingHorizontal: 16,
    paddingVertical: 16,
    ...CARD_SHADOW,
  },
  databaseRowTitle: {
    ...Type.headline,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  databaseRowHint: {
    ...Type.caption,
    color: Colors.textTertiary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  genericDataRow: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  genericDataTitle: {
    ...Type.headline,
    color: Colors.textPrimary,
  },
  genericDataHint: {
    ...Type.caption,
    color: Colors.textTertiary,
  },
  createOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  createOption: {
    flex: 1,
    height: 160,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.background,
    overflow: 'hidden',
    padding: 16,
    alignItems: 'center',
    ...CARD_SHADOW,
  },
  createOptionLabel: {
    ...Type.headline,
    color: Colors.textPrimary,
    alignSelf: 'flex-start',
  },
  createOptionImageWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createOptionImage: {
    width: 118,
    height: 118,
  },
});
