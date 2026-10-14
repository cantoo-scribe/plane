# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import datetime, time, timedelta

# Django imports
from django.db import transaction
from django.db.models import Sum, Count, F
from django.db.models.functions import TruncDate, Coalesce
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseAPIView, BaseViewSet
from plane.app.permissions import ProjectEntityPermission, allow_permission, ROLE
from plane.app.serializers.time_entry import TimeEntrySerializer
from plane.db.models import TimeEntry, Issue, Project, Cycle, ProjectMember
from plane.db.models.time_entry import compute_duration_minutes


def _parse_datetime_bound(value, end_of_day=False):
    if not value:
        return None
    dt = parse_datetime(value)
    if dt is not None:
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        return dt
    d = parse_date(value)
    if d is not None:
        t = time.max if end_of_day else time.min
        dt = datetime.combine(d, t)
        return timezone.make_aware(dt, timezone.get_current_timezone())
    return None


class IssueTimeEntryEndpoint(BaseViewSet):
    permission_classes = [ProjectEntityPermission]
    model = TimeEntry
    serializer_class = TimeEntrySerializer

    def get_queryset(self):
        return (
            TimeEntry.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                project_id=self.kwargs.get("project_id"),
                issue_id=self.kwargs.get("issue_id"),
            )
            .select_related("issue", "project", "logged_by")
            .order_by("-started_at")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def list(self, request, slug, project_id, issue_id):
        entries = self.get_queryset()
        serializer = TimeEntrySerializer(entries, many=True)
        total = entries.filter(stopped_at__isnull=False).aggregate(total=Coalesce(Sum("duration"), 0))["total"]
        return Response({"results": serializer.data, "total_duration": total}, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id, issue_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if not project:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if not project.is_time_tracking_enabled:
            return Response(
                {"error": "Time tracking is not enabled for this project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issue = Issue.objects.filter(pk=issue_id, project_id=project_id, workspace__slug=slug).first()
        if not issue:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        start_timer = bool(request.data.get("start_timer", False))

        if start_timer:
            with transaction.atomic():
                TimeEntry.stop_running_for_user(request.user.id)
                entry = TimeEntry.objects.create(
                    project_id=project_id,
                    workspace_id=project.workspace_id,
                    issue_id=issue_id,
                    logged_by=request.user,
                    description=request.data.get("description", ""),
                    started_at=timezone.now(),
                    stopped_at=None,
                    duration=0,
                )
            serializer = TimeEntrySerializer(entry)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        # Manual log
        duration = request.data.get("duration")
        started_at = _parse_datetime_bound(request.data.get("started_at")) or timezone.now()
        stopped_at = _parse_datetime_bound(request.data.get("stopped_at"), end_of_day=False)

        if duration is None:
            if stopped_at:
                duration = compute_duration_minutes(started_at, stopped_at)
            else:
                return Response(
                    {"error": "duration is required for manual time entries"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            duration = int(duration)
        except (TypeError, ValueError):
            return Response({"error": "duration must be an integer (minutes)"}, status=status.HTTP_400_BAD_REQUEST)

        if duration <= 0:
            return Response({"error": "duration must be greater than 0"}, status=status.HTTP_400_BAD_REQUEST)

        if not stopped_at:
            stopped_at = started_at + timedelta(minutes=duration)

        entry = TimeEntry.objects.create(
            project_id=project_id,
            workspace_id=project.workspace_id,
            issue_id=issue_id,
            logged_by=request.user,
            description=request.data.get("description", ""),
            started_at=started_at,
            stopped_at=stopped_at,
            duration=duration,
        )
        serializer = TimeEntrySerializer(entry)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class TimeEntryDetailEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, pk):
        entry = (
            TimeEntry.objects.filter(pk=pk, workspace__slug=slug, project_id=project_id)
            .select_related("issue", "project", "logged_by")
            .first()
        )
        if not entry:
            return Response({"error": "Time entry not found"}, status=status.HTTP_404_NOT_FOUND)

        is_admin = ProjectMember.objects.filter(
            project_id=project_id,
            member=request.user,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).exists()
        if entry.logged_by_id != request.user.id and not is_admin:
            return Response(
                {"error": "You can only edit your own time entries"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if "description" in request.data:
            entry.description = request.data.get("description") or ""
        if "started_at" in request.data:
            parsed = _parse_datetime_bound(request.data.get("started_at"))
            if parsed:
                entry.started_at = parsed
        if "stopped_at" in request.data:
            parsed = _parse_datetime_bound(request.data.get("stopped_at"))
            entry.stopped_at = parsed
        if "duration" in request.data:
            try:
                duration = int(request.data.get("duration"))
            except (TypeError, ValueError):
                return Response({"error": "duration must be an integer"}, status=status.HTTP_400_BAD_REQUEST)
            if duration < 0:
                return Response({"error": "duration cannot be negative"}, status=status.HTTP_400_BAD_REQUEST)
            entry.duration = duration
        elif entry.started_at and entry.stopped_at:
            entry.duration = compute_duration_minutes(entry.started_at, entry.stopped_at)

        if entry.stopped_at and entry.started_at and entry.stopped_at < entry.started_at:
            return Response({"error": "stopped_at must be after started_at"}, status=status.HTTP_400_BAD_REQUEST)

        entry.save()
        serializer = TimeEntrySerializer(entry)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, pk):
        entry = TimeEntry.objects.filter(pk=pk, workspace__slug=slug, project_id=project_id).first()
        if not entry:
            return Response({"error": "Time entry not found"}, status=status.HTTP_404_NOT_FOUND)

        is_admin = ProjectMember.objects.filter(
            project_id=project_id,
            member=request.user,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).exists()
        if entry.logged_by_id != request.user.id and not is_admin:
            return Response(
                {"error": "You can only delete your own time entries"},
                status=status.HTTP_403_FORBIDDEN,
            )

        entry.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TimeEntryStopEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        stopped = TimeEntry.stop_running_for_user(request.user.id)
        if not stopped:
            return Response({"error": "No running timer"}, status=status.HTTP_404_NOT_FOUND)
        stopped = (
            TimeEntry.objects.filter(pk=stopped.pk)
            .select_related("issue", "project", "logged_by")
            .first()
        )
        serializer = TimeEntrySerializer(stopped)
        return Response(serializer.data, status=status.HTTP_200_OK)


class RunningTimeEntryEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        entry = (
            TimeEntry.objects.filter(
                workspace__slug=slug,
                logged_by=request.user,
                stopped_at__isnull=True,
            )
            .select_related("issue", "project", "logged_by")
            .first()
        )
        if not entry:
            return Response(None, status=status.HTTP_200_OK)
        serializer = TimeEntrySerializer(entry)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WorkspaceTimeEntryReportEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        qs = TimeEntry.objects.filter(
            workspace__slug=slug,
            stopped_at__isnull=False,
            project__project_projectmember__member=request.user,
            project__project_projectmember__is_active=True,
        ).distinct()

        # Cycle filter overrides date range when provided
        cycle_id = request.query_params.get("cycle_id")
        if cycle_id:
            cycle = Cycle.objects.filter(pk=cycle_id, workspace__slug=slug).first()
            if not cycle:
                return Response({"error": "Cycle not found"}, status=status.HTTP_404_NOT_FOUND)
            if cycle.start_date:
                qs = qs.filter(started_at__gte=cycle.start_date)
            if cycle.end_date:
                qs = qs.filter(started_at__lte=cycle.end_date)
        else:
            start_date = _parse_datetime_bound(request.query_params.get("start_date"))
            end_date = _parse_datetime_bound(request.query_params.get("end_date"), end_of_day=True)
            if start_date:
                qs = qs.filter(started_at__gte=start_date)
            if end_date:
                qs = qs.filter(started_at__lte=end_date)

        project_ids = request.query_params.get("project_ids")
        if project_ids:
            ids = [p.strip() for p in project_ids.split(",") if p.strip()]
            qs = qs.filter(project_id__in=ids)

        user_ids = request.query_params.get("user_ids")
        if user_ids:
            ids = [u.strip() for u in user_ids.split(",") if u.strip()]
            qs = qs.filter(logged_by_id__in=ids)

        group_by = request.query_params.get("group_by", "user")
        include_entries = request.query_params.get("include_entries", "false").lower() == "true"

        aggregates = []
        if group_by == "user":
            rows = (
                qs.values("logged_by_id")
                .annotate(total_duration=Coalesce(Sum("duration"), 0), entry_count=Count("id"))
                .order_by("-total_duration")
            )
            aggregates = [
                {
                    "group_id": str(r["logged_by_id"]),
                    "group_by": "user",
                    "total_duration": r["total_duration"],
                    "entry_count": r["entry_count"],
                }
                for r in rows
            ]
        elif group_by == "project":
            rows = (
                qs.values("project_id", project_name=F("project__name"), project_identifier=F("project__identifier"))
                .annotate(total_duration=Coalesce(Sum("duration"), 0), entry_count=Count("id"))
                .order_by("-total_duration")
            )
            aggregates = [
                {
                    "group_id": str(r["project_id"]),
                    "group_by": "project",
                    "name": r["project_name"],
                    "identifier": r["project_identifier"],
                    "total_duration": r["total_duration"],
                    "entry_count": r["entry_count"],
                }
                for r in rows
            ]
        elif group_by == "issue":
            # Use field names for FK ids — annotating project_id=F("project_id") conflicts with the model field.
            rows = (
                qs.values(
                    "issue_id",
                    "project_id",
                    issue_name=F("issue__name"),
                    sequence_id=F("issue__sequence_id"),
                    project_identifier=F("project__identifier"),
                )
                .annotate(total_duration=Coalesce(Sum("duration"), 0), entry_count=Count("id"))
                .order_by("-total_duration")
            )
            aggregates = [
                {
                    "group_id": str(r["issue_id"]),
                    "group_by": "issue",
                    "name": r["issue_name"],
                    "sequence_id": r["sequence_id"],
                    "project_id": str(r["project_id"]),
                    "project_identifier": r["project_identifier"],
                    "total_duration": r["total_duration"],
                    "entry_count": r["entry_count"],
                }
                for r in rows
            ]
        elif group_by == "day":
            rows = (
                qs.annotate(day=TruncDate("started_at"))
                .values("day")
                .annotate(total_duration=Coalesce(Sum("duration"), 0), entry_count=Count("id"))
                .order_by("day")
            )
            aggregates = [
                {
                    "group_id": r["day"].isoformat() if r["day"] else None,
                    "group_by": "day",
                    "total_duration": r["total_duration"],
                    "entry_count": r["entry_count"],
                }
                for r in rows
            ]
        elif group_by == "user_project":
            # Per-project breakdown by member
            rows = (
                qs.values(
                    "logged_by_id",
                    "project_id",
                    project_name=F("project__name"),
                    project_identifier=F("project__identifier"),
                )
                .annotate(total_duration=Coalesce(Sum("duration"), 0), entry_count=Count("id"))
                .order_by("logged_by_id", "-total_duration")
            )
            aggregates = [
                {
                    "group_id": f"{r['logged_by_id']}:{r['project_id']}",
                    "group_by": "user_project",
                    "user_id": str(r["logged_by_id"]),
                    "project_id": str(r["project_id"]),
                    "project_name": r["project_name"],
                    "project_identifier": r["project_identifier"],
                    "total_duration": r["total_duration"],
                    "entry_count": r["entry_count"],
                }
                for r in rows
            ]
        else:
            return Response(
                {"error": "group_by must be one of: user, project, issue, day, user_project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        total_duration = qs.aggregate(total=Coalesce(Sum("duration"), 0))["total"]

        payload = {
            "aggregates": aggregates,
            "total_duration": total_duration,
            "group_by": group_by,
        }

        if include_entries:
            entries = qs.select_related("issue", "project", "logged_by").order_by("-started_at")[:1000]
            payload["entries"] = TimeEntrySerializer(entries, many=True).data

        return Response(payload, status=status.HTTP_200_OK)


class IssueTimeEntrySummaryEndpoint(BaseAPIView):
    """Return tracked total and estimate (minutes) for a single issue."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id, issue_id):
        issue = (
            Issue.objects.filter(pk=issue_id, project_id=project_id, workspace__slug=slug)
            .select_related("estimate_point", "estimate_point__estimate")
            .first()
        )
        if not issue:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        total = (
            TimeEntry.objects.filter(
                issue_id=issue_id,
                project_id=project_id,
                workspace__slug=slug,
                stopped_at__isnull=False,
            ).aggregate(total=Coalesce(Sum("duration"), 0))["total"]
        )

        estimated = None
        estimate_type = None
        if issue.estimate_point_id and issue.estimate_point:
            estimate_type = issue.estimate_point.estimate.type if issue.estimate_point.estimate_id else None
            if estimate_type == "time":
                try:
                    estimated = int(float(issue.estimate_point.value))
                except (TypeError, ValueError):
                    estimated = None

        return Response(
            {
                "issue_id": str(issue_id),
                "total_duration": total,
                "estimated_duration": estimated,
                "estimate_type": estimate_type,
            },
            status=status.HTTP_200_OK,
        )
