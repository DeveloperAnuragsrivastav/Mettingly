from datetime import datetime, date, time
from typing import Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, Field

class WeeklySchedule(BaseModel):
    mon: List[List[str]] = []
    tue: List[List[str]] = []
    wed: List[List[str]] = []
    thu: List[List[str]] = []
    fri: List[List[str]] = []
    sat: List[List[str]] = []
    sun: List[List[str]] = []

class AvailabilityConfig(BaseModel):
    timezone: str
    weekly_schedule: WeeklySchedule
    buffer_minutes: int
    min_notice_minutes: int
    max_booking_window_days: int

class DateBlock(BaseModel):
    block_date: date
    is_full_day: bool
    partial_start_time: Optional[time] = None
    partial_end_time: Optional[time] = None
    reason: Optional[str] = None

class TimeSlot(BaseModel):
    start_time_utc: datetime
    end_time_utc: datetime

class AvailabilityResult(BaseModel):
    slots: List[TimeSlot]
    is_degraded: bool = False
    error_message: Optional[str] = None

class AggregatedAvailabilityResult(BaseModel):
    slots: Dict[datetime, List[UUID]]
    skipped_members: Dict[UUID, str]

class AvailabilityOverrideExists(BaseModel):
    timezone: bool
    weekly_schedule: bool
    buffer_minutes: bool
    min_notice_minutes: bool
    max_booking_window_days: bool

class MemberAvailabilityResponse(BaseModel):
    resolved: AvailabilityConfig
    member_override_exists: AvailabilityOverrideExists

class UpdateMemberAvailabilityRequest(BaseModel):
    timezone: Optional[str] = None
    weekly_schedule: Optional[WeeklySchedule] = None
    buffer_minutes: Optional[int] = None
    min_notice_minutes: Optional[int] = None
    max_booking_window_days: Optional[int] = None

class TeamAvailabilityOverrideExists(BaseModel):
    timezone: bool
    weekly_schedule: bool
    buffer_minutes: bool
    min_notice_minutes: bool
    max_booking_window_days: bool

class TeamAvailabilityResponse(BaseModel):
    resolved: AvailabilityConfig
    team_override_exists: TeamAvailabilityOverrideExists

class UpdateTeamAvailabilityRequest(BaseModel):
    timezone: Optional[str] = None
    weekly_schedule: Optional[WeeklySchedule] = None
    buffer_minutes: Optional[int] = None
    min_notice_minutes: Optional[int] = None
    max_booking_window_days: Optional[int] = None

class CreateDateBlockRequest(BaseModel):
    block_date: date
    is_full_day: bool
    partial_start_time: Optional[time] = None
    partial_end_time: Optional[time] = None
    reason: Optional[str] = None

class DateBlockResponse(BaseModel):
    id: UUID
    member_id: UUID
    block_date: date
    is_full_day: bool
    partial_start_time: Optional[time] = None
    partial_end_time: Optional[time] = None
    reason: Optional[str] = None
    created_at: datetime

