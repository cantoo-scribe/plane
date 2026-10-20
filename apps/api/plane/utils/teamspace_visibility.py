# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Cross-visibility rules for projects, teamspaces (pôles), and OKRs.

An issue always has a home ``project``. Optionally it may point at:
- ``linked_project`` — a regular (client) project
- ``linked_teamspace`` — a teamspace / pôle
- ``linked_okr`` — an OKR container

Teamspace lists also include issues from regular projects assigned to a
teamspace member.
"""

from __future__ import annotations

from django.db.models import Q, QuerySet

from plane.db.models import Issue, Project, ProjectMember


def issues_visible_in_project(workspace_slug: str, project: Project) -> QuerySet:
    """Return issues that should appear in the work-item list for ``project``."""
    base = Issue.issue_objects.filter(workspace__slug=workspace_slug)

    if project.is_okr:
        ownership = Q(project_id=project.id) | Q(linked_okr_id=project.id)
        return base.filter(ownership)

    if project.is_teamspace:
        ownership = Q(project_id=project.id) | Q(linked_teamspace_id=project.id)
        member_ids = ProjectMember.objects.filter(
            project_id=project.id,
            is_active=True,
            deleted_at__isnull=True,
        ).values_list("member_id", flat=True)

        assignee_rule = Q(
            project__is_teamspace=False,
            project__is_okr=False,
            issue_assignee__assignee_id__in=member_ids,
            issue_assignee__deleted_at__isnull=True,
        )
        return base.filter(ownership | assignee_rule).distinct()

    ownership = Q(project_id=project.id) | Q(linked_project_id=project.id)
    return base.filter(ownership)


def _base_link_checks(home_project: Project, linked: Project | None, field_name: str) -> None:
    if linked is None:
        return
    if linked.id == home_project.id:
        raise ValueError(f"{field_name} cannot be the same as the home project")
    if linked.workspace_id != home_project.workspace_id:
        raise ValueError(f"{field_name} must belong to the same workspace")


def validate_linked_project(home_project: Project, linked_project: Project | None) -> None:
    """``linked_project`` must be a regular (non-teamspace, non-OKR) project."""
    _base_link_checks(home_project, linked_project, "linked_project")
    if linked_project is None:
        return
    if linked_project.is_teamspace or linked_project.is_okr:
        raise ValueError("linked_project must be a regular project")
    if not home_project.is_teamspace and not home_project.is_okr:
        raise ValueError("linked_project can only be set from a teamspace or OKR")


def validate_linked_teamspace(home_project: Project, linked_teamspace: Project | None) -> None:
    """``linked_teamspace`` must be a teamspace / pôle."""
    _base_link_checks(home_project, linked_teamspace, "linked_teamspace")
    if linked_teamspace is None:
        return
    if not linked_teamspace.is_teamspace:
        raise ValueError("linked_teamspace must be a teamspace")
    if home_project.is_teamspace:
        raise ValueError("home teamspace cannot also set linked_teamspace")


def validate_linked_okr(home_project: Project, linked_okr: Project | None) -> None:
    """``linked_okr`` must be an OKR project."""
    _base_link_checks(home_project, linked_okr, "linked_okr")
    if linked_okr is None:
        return
    if not linked_okr.is_okr:
        raise ValueError("linked_okr must be an OKR project")
    if home_project.is_okr:
        raise ValueError("home OKR cannot also set linked_okr")


def validate_issue_cross_links(
    home_project: Project,
    linked_project: Project | None = None,
    linked_teamspace: Project | None = None,
    linked_okr: Project | None = None,
) -> None:
    """Validate all optional cross-link FKs together."""
    validate_linked_project(home_project, linked_project)
    validate_linked_teamspace(home_project, linked_teamspace)
    validate_linked_okr(home_project, linked_okr)
