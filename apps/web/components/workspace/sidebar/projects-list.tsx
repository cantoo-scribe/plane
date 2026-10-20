/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState, useRef, useEffect } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
import { Collapsible } from "@makeplane/propel/components/collapsible";
import { AddOutline, MoreHorizontalOutline } from "@makeplane/propel/icons";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@makeplane/propel/components/icon-button";
import { Icon } from "@makeplane/propel/components/icon";
import { setToast } from "@plane/blocks/toast";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import { Loader } from "@plane/blocks/skeleton";
import { copyUrlToClipboard, cn, orderJoinedProjects } from "@plane/utils";
// components
import { CreateProjectModal } from "@/components/project/create-project-modal";
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useProjectNavigationPreferences } from "@/hooks/use-navigation-preferences";
// plane web imports
import type { TProject } from "@plane/types";
// local imports
import { SidebarProjectsListItem } from "./projects-list-item";

export const SidebarProjectsList = observer(function SidebarProjectsList() {
  // states
  const [isAllProjectsListOpen, setIsAllProjectsListOpen] = useState(true);
  const [isTeamspacesListOpen, setIsTeamspacesListOpen] = useState(true);
  const [isOkrsListOpen, setIsOkrsListOpen] = useState(true);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [createAsTeamspace, setCreateAsTeamspace] = useState(false);
  const [createAsOkr, setCreateAsOkr] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false); // scroll animation state
  // refs
  const containerRef = useRef<HTMLDivElement | null>(null);
  // store hooks
  const { t } = useTranslation();
  const { toggleCreateProjectModal } = useCommandPalette();
  const { allowPermissions } = useUserPermissions();
  const { preferences: projectPreferences } = useProjectNavigationPreferences();
  const { isExtendedProjectSidebarOpened, toggleExtendedProjectSidebar } = useAppTheme();

  const {
    loader,
    getPartialProjectById,
    joinedRegularProjectIds: joinedProjects,
    visibleRegularProjectIds: visibleProjects,
    joinedTeamspaceIds: joinedTeamspaces,
    visibleTeamspaceIds: visibleTeamspaces,
    joinedOkrIds: joinedOkrs,
    visibleOkrIds: visibleOkrs,
    updateProjectView,
  } = useProject();
  // router params
  const { workspaceSlug } = useParams();
  const pathname = usePathname();

  // auth
  const isAuthorizedUser = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  // Compute limited projects for main sidebar (public projects appear without join)
  const displayedProjects = projectPreferences.showLimitedProjects
    ? visibleProjects.slice(0, projectPreferences.limitedProjectsCount)
    : visibleProjects;

  // Check if there are more projects to show
  const hasMoreProjects =
    projectPreferences.showLimitedProjects && visibleProjects.length > projectPreferences.limitedProjectsCount;

  const handleCopyText = (projectId: string) => {
    void copyUrlToClipboard(`${workspaceSlug}/projects/${projectId}/issues`).then(() => {
      setToast({
        type: "success",
        title: t("link_copied"),
        message: t("project_link_copied_to_clipboard"),
      });
      return undefined;
    });
  };

  const handleOnProjectDrop = (
    sourceId: string | undefined,
    destinationId: string | undefined,
    shouldDropAtEnd: boolean,
    listIds: string[]
  ) => {
    if (!sourceId || !destinationId || !workspaceSlug) return;
    if (sourceId === destinationId) return;

    const joinedProjectsList: TProject[] = [];
    listIds.map((projectId) => {
      const projectDetails = getPartialProjectById(projectId);
      if (projectDetails) joinedProjectsList.push(projectDetails);
    });

    const sourceIndex = listIds.indexOf(sourceId);
    const destinationIndex = shouldDropAtEnd ? listIds.length : listIds.indexOf(destinationId);

    if (joinedProjectsList.length <= 0) return;

    const updatedSortOrder = orderJoinedProjects(sourceIndex, destinationIndex, sourceId, joinedProjectsList);
    if (updatedSortOrder != undefined)
      updateProjectView(workspaceSlug.toString(), sourceId, { sort_order: updatedSortOrder }).catch(() => {
        setToast({
          type: "error",
          title: t("error"),
          message: t("something_went_wrong"),
        });
      });
  };

  /**
   * Implementing scroll animation styles based on the scroll length of the container
   */
  useEffect(() => {
    const handleScroll = () => {
      if (containerRef.current) {
        const scrollTop = containerRef.current.scrollTop;
        setIsScrolled(scrollTop > 0);
      }
    };
    const currentContainerRef = containerRef.current;
    if (currentContainerRef) {
      currentContainerRef.addEventListener("scroll", handleScroll);
    }
    return () => {
      if (currentContainerRef) {
        currentContainerRef.removeEventListener("scroll", handleScroll);
      }
    };
  }, [containerRef]);

  useEffect(() => {
    const element = containerRef.current;

    if (!element) return;

    return combine(
      autoScrollForElements({
        element,
        canScroll: ({ source }) => source?.data?.dragInstanceId === "PROJECTS",
        getAllowedAxis: () => "vertical",
      })
    );
  }, [containerRef]);

  const toggleListDisclosure = (isOpen: boolean) => {
    setIsAllProjectsListOpen(isOpen);
    localStorage.setItem("isAllProjectsListOpen", isOpen.toString());
  };

  const toggleTeamspacesDisclosure = (isOpen: boolean) => {
    setIsTeamspacesListOpen(isOpen);
    localStorage.setItem("isTeamspacesListOpen", isOpen.toString());
  };

  const toggleOkrsDisclosure = (isOpen: boolean) => {
    setIsOkrsListOpen(isOpen);
    localStorage.setItem("isOkrsListOpen", isOpen.toString());
  };

  useEffect(() => {
    if (pathname.includes("projects")) {
      setIsAllProjectsListOpen(true);
      localStorage.setItem("isAllProjectsListOpen", "true");
    }
  }, [pathname]);

  useEffect(() => {
    const stored = localStorage.getItem("isTeamspacesListOpen");
    if (stored !== null) setIsTeamspacesListOpen(stored === "true");
    const okrStored = localStorage.getItem("isOkrsListOpen");
    if (okrStored !== null) setIsOkrsListOpen(okrStored === "true");
  }, []);

  const renderProjectItems = (projectIds: string[], listIds: string[]) =>
    projectIds.map((projectId, index) => (
      <SidebarProjectsListItem
        key={projectId}
        projectId={projectId}
        handleCopyText={() => handleCopyText(projectId)}
        projectListType={"JOINED"}
        disableDrag={false}
        disableDrop={false}
        isLastChild={index === projectIds.length - 1}
        handleOnProjectDrop={(sourceId, destinationId, shouldDropAtEnd) =>
          handleOnProjectDrop(sourceId, destinationId, shouldDropAtEnd, listIds)
        }
      />
    ));

  return (
    <>
      {workspaceSlug && (
        <CreateProjectModal
          isOpen={isProjectModalOpen}
          onClose={() => {
            setIsProjectModalOpen(false);
            setCreateAsTeamspace(false);
            setCreateAsOkr(false);
          }}
          setToFavorite={false}
          workspaceSlug={workspaceSlug.toString()}
          data={createAsTeamspace ? { is_teamspace: true } : createAsOkr ? { is_okr: true } : undefined}
        />
      )}
      <div
        ref={containerRef}
        className={cn({
          "border-t border-strong": isScrolled,
        })}
      >
        <>
          {(visibleTeamspaces.length > 0 || isAuthorizedUser) && (
            <Collapsible
              placement="sidebar"
              render={<div className="group/teamspaces-section" />}
              open={isTeamspacesListOpen}
              onOpenChange={toggleTeamspacesDisclosure}
              trigger={
                <span className="text-13 font-semibold whitespace-nowrap text-placeholder">{t("teamspaces")}</span>
              }
              trailing={
                isAuthorizedUser ? (
                  <span className="hidden text-placeholder group-focus-within/teamspaces-section:inline-flex group-hover/teamspaces-section:inline-flex">
                    <Tooltip label={t("create_teamspace")}>
                      <IconButton
                        variant="ghost"
                        size="xs"
                        icon={<Icon icon={AddOutline} />}
                        onClick={() => {
                          setCreateAsOkr(false);
                          setCreateAsTeamspace(true);
                          setIsProjectModalOpen(true);
                        }}
                        aria-label={t("create_teamspace")}
                      />
                    </Tooltip>
                  </span>
                ) : null
              }
            >
              <div className="flex flex-col gap-0.5">
                {loader === "init-loader" && (
                  <Loader className="w-full space-y-1.5">
                    {Array.from({ length: 3 }).map((_, index) => (
                      // oxlint-disable-next-line react/no-array-index-key
                      <Loader.Item key={index} height="28px" />
                    ))}
                  </Loader>
                )}
                {renderProjectItems(visibleTeamspaces, joinedTeamspaces)}
              </div>
            </Collapsible>
          )}

          {(visibleOkrs.length > 0 || isAuthorizedUser) && (
            <Collapsible
              placement="sidebar"
              render={<div className="group/okrs-section" />}
              open={isOkrsListOpen}
              onOpenChange={toggleOkrsDisclosure}
              trigger={<span className="text-13 font-semibold whitespace-nowrap text-placeholder">{t("okrs")}</span>}
              trailing={
                isAuthorizedUser ? (
                  <span className="hidden text-placeholder group-focus-within/okrs-section:inline-flex group-hover/okrs-section:inline-flex">
                    <Tooltip label={t("create_okr")}>
                      <IconButton
                        variant="ghost"
                        size="xs"
                        icon={<Icon icon={AddOutline} />}
                        onClick={() => {
                          setCreateAsTeamspace(false);
                          setCreateAsOkr(true);
                          setIsProjectModalOpen(true);
                        }}
                        aria-label={t("create_okr")}
                      />
                    </Tooltip>
                  </span>
                ) : null
              }
            >
              <div className="flex flex-col gap-0.5">
                {loader === "init-loader" && (
                  <Loader className="w-full space-y-1.5">
                    {Array.from({ length: 2 }).map((_, index) => (
                      // oxlint-disable-next-line react/no-array-index-key
                      <Loader.Item key={index} height="28px" />
                    ))}
                  </Loader>
                )}
                {renderProjectItems(visibleOkrs, joinedOkrs)}
              </div>
            </Collapsible>
          )}

          <Collapsible
            placement="sidebar"
            // the group marker lives on the root: CollapsibleHeader takes no className
            render={<div className="group/projects-section" />}
            open={isAllProjectsListOpen}
            onOpenChange={toggleListDisclosure}
            trigger={<span className="text-13 font-semibold whitespace-nowrap text-placeholder">{t("projects")}</span>}
            trailing={
              isAuthorizedUser ? (
                <span className="hidden text-placeholder group-focus-within/projects-section:inline-flex group-hover/projects-section:inline-flex">
                  <Tooltip label={t("create_project")}>
                    <IconButton
                      variant="ghost"
                      size="xs"
                      icon={<Icon icon={AddOutline} />}
                      onClick={() => {
                        setCreateAsTeamspace(false);
                        setCreateAsOkr(false);
                        setIsProjectModalOpen(true);
                      }}
                      aria-label={t("aria_labels.projects_sidebar.create_new_project")}
                    />
                  </Tooltip>
                </span>
              ) : null
            }
          >
            <div className="flex flex-col gap-0.5">
              {loader === "init-loader" && (
                <Loader className="w-full space-y-1.5">
                  {Array.from({ length: 4 }).map((_, index) => (
                    // oxlint-disable-next-line react/no-array-index-key
                    <Loader.Item key={index} height="28px" />
                  ))}
                </Loader>
              )}
              {renderProjectItems(displayedProjects, joinedProjects)}
              {hasMoreProjects && (
                <SidebarNavItem>
                  <button
                    type="button"
                    onClick={() => toggleExtendedProjectSidebar()}
                    className="flex flex-grow items-center gap-1.5 text-13 font-medium text-tertiary"
                    id="extended-project-sidebar-toggle"
                    aria-label={t(
                      isExtendedProjectSidebarOpened
                        ? "aria_labels.app_sidebar.close_extended_sidebar"
                        : "aria_labels.app_sidebar.open_extended_sidebar"
                    )}
                  >
                    <MoreHorizontalOutline className="size-4 flex-shrink-0" />
                    <span>{isExtendedProjectSidebarOpened ? "Hide" : "More"}</span>
                  </button>
                </SidebarNavItem>
              )}
            </div>
          </Collapsible>
        </>

        {isAuthorizedUser &&
          visibleProjects.length === 0 &&
          visibleTeamspaces.length === 0 &&
          visibleOkrs.length === 0 && (
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-13 leading-5 font-medium text-secondary hover:bg-surface-2"
              onClick={() => {
                toggleCreateProjectModal(true);
              }}
            >
              {t("add_project")}
            </button>
          )}
      </div>
    </>
  );
});
