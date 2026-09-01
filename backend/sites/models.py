from django.db import models
from django.contrib.auth.models import User

class Site(models.Model):
    # Primary Identifiers
    ihs_site_id = models.CharField(max_length=50, unique=True, db_index=True)
    mtn_id = models.CharField(max_length=50, blank=True, null=True, db_index=True)
    cascade = models.CharField(max_length=50, blank=True, null=True)
    priority = models.CharField(max_length=20, default='P2')
    ncc_site = models.CharField(max_length=50, blank=True, null=True)
    hvc_cluster = models.CharField(max_length=100, blank=True, null=True)

    # Operational Specs
    operational_status = models.CharField(max_length=50, default='Operational')
    site_configuration = models.CharField(max_length=100, blank=True, null=True)
    power_solution = models.CharField(max_length=100, blank=True, null=True)
    dg_capacity = models.CharField(max_length=50, blank=True, null=True)
    solution_on_site = models.CharField(max_length=100, blank=True, null=True)
    solution_category = models.CharField(max_length=100, blank=True, null=True)
    functionality_mode = models.CharField(max_length=100, blank=True, null=True)

    # Emergency Contacts & Engineering Personnel Directory
    efs_name = models.CharField(max_length=100, blank=True, null=True)
    efs_phone = models.CharField(max_length=50, blank=True, null=True)
    rto_name = models.CharField(max_length=100, blank=True, null=True)
    rto_phone = models.CharField(max_length=50, blank=True, null=True)
    smc = models.CharField(max_length=100, blank=True, null=True)
    sub_sbc = models.CharField(max_length=100, blank=True, null=True)
    cluster_name = models.CharField(max_length=100, blank=True, null=True)
    smc_fse_name = models.CharField(max_length=100, blank=True, null=True)
    smc_fse_phone = models.CharField(max_length=50, blank=True, null=True)
    smc_rto_name = models.CharField(max_length=100, blank=True, null=True)
    smc_rto_phone = models.CharField(max_length=50, blank=True, null=True)
    smc_hoo_name = models.CharField(max_length=100, blank=True, null=True)
    smc_hoo_phone = models.CharField(max_length=50, blank=True, null=True)

    # Management Team
    sdm_name = models.CharField(max_length=100, blank=True, null=True)
    sdm_phone = models.CharField(max_length=50, blank=True, null=True)
    mtn_rdm_name = models.CharField(max_length=100, blank=True, null=True)
    mtn_rdm_phone = models.CharField(max_length=50, blank=True, null=True)
    mtn_fse_name = models.CharField(max_length=100, blank=True, null=True)
    mtn_fse_phone = models.CharField(max_length=50, blank=True, null=True)
    mtn_rtm_name = models.CharField(max_length=100, blank=True, null=True)
    mtn_rtm_phone = models.CharField(max_length=50, blank=True, null=True)

    # Geo Location
    site_address = models.TextField(blank=True, null=True)
    region = models.CharField(max_length=50, default='FCT')
    state = models.CharField(max_length=50, default='FCT')
    lga = models.CharField(max_length=100, blank=True, null=True)
    latitude = models.FloatField(blank=True, null=True)
    longitude = models.FloatField(blank=True, null=True)

    # Full raw specs containing ALL 87 columns from WSD Excel
    raw_data = models.JSONField(default=dict, blank=True)

    # Flags & Timestamps
    is_down = models.BooleanField(default=False)
    is_critical = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.ihs_site_id} ({self.priority}) - {self.cluster_name}"

class Notification(models.Model):
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name='notifications', null=True, blank=True)
    title = models.CharField(max_length=200)
    message = models.TextField()
    alert_type = models.CharField(max_length=50, default='INFO')  # CRITICAL, WARNING, INFO
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[{self.alert_type}] {self.title}"


class TNLLink(models.Model):
    state = models.CharField(max_length=50, blank=True, default='')
    region = models.CharField(max_length=50, blank=True, default='')
    site_a = models.CharField(max_length=50, db_index=True, blank=True, default='')
    site_b = models.CharField(max_length=50, db_index=True, blank=True, default='')
    segment_name = models.CharField(max_length=255, blank=True, default='')
    distance_km = models.FloatField(null=True, blank=True, default=0.0)
    network_type = models.CharField(max_length=50, blank=True, default='')
    old_fmp = models.CharField(max_length=100, blank=True, default='')
    maintenance_fmp = models.CharField(max_length=100, blank=True, default='TNL')
    
    site_a_ref = models.ForeignKey(Site, on_delete=models.SET_NULL, null=True, blank=True, related_name='tnl_links_a')
    site_b_ref = models.ForeignKey(Site, on_delete=models.SET_NULL, null=True, blank=True, related_name='tnl_links_b')
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['state', 'segment_name']

    def __str__(self):
        return f"TNL Link [{self.state}] {self.segment_name} ({self.distance_km}km)"


class IHSFiberLink(models.Model):
    cluster_ref = models.CharField(max_length=50, blank=True, default='')
    segment_id = models.CharField(max_length=255, db_index=True, blank=True, default='')
    site_a = models.CharField(max_length=50, db_index=True, blank=True, default='')
    site_b = models.CharField(max_length=50, db_index=True, blank=True, default='')
    fibre_length_m = models.FloatField(null=True, blank=True, default=0.0)
    distance_km = models.FloatField(null=True, blank=True, default=0.0)
    state = models.CharField(max_length=50, blank=True, default='FCT')
    
    site_a_ref = models.ForeignKey(Site, on_delete=models.SET_NULL, null=True, blank=True, related_name='ihs_fiber_links_a')
    site_b_ref = models.ForeignKey(Site, on_delete=models.SET_NULL, null=True, blank=True, related_name='ihs_fiber_links_b')
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['cluster_ref', 'segment_id']

    def __str__(self):
        return f"IHS Fiber Link [{self.cluster_ref}] {self.segment_id} ({self.distance_km}km)"


class HuaweiFiberLink(models.Model):
    cluster_name = models.CharField(max_length=100, blank=True, default='')
    state = models.CharField(max_length=50, db_index=True, blank=True, default='')
    region = models.CharField(max_length=50, blank=True, default='')
    site_a = models.CharField(max_length=50, db_index=True, blank=True, default='')
    site_b = models.CharField(max_length=50, db_index=True, blank=True, default='')
    segment_name = models.CharField(max_length=255, db_index=True, blank=True, default='')
    distance_km = models.FloatField(null=True, blank=True, default=0.0)
    network_type = models.CharField(max_length=50, blank=True, default='')
    old_fmp = models.CharField(max_length=100, blank=True, default='')
    maintenance_fmp = models.CharField(max_length=100, blank=True, default='Huawei')
    huawei_fsdm = models.CharField(max_length=100, blank=True, default='')
    huawei_fsdm_number = models.CharField(max_length=50, blank=True, default='')

    site_a_ref = models.ForeignKey(Site, on_delete=models.SET_NULL, null=True, blank=True, related_name='huawei_fiber_links_a')
    site_b_ref = models.ForeignKey(Site, on_delete=models.SET_NULL, null=True, blank=True, related_name='huawei_fiber_links_b')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['state', 'segment_name']

    def __str__(self):
        return f"Huawei Fiber Link [{self.state}] {self.segment_name} ({self.distance_km}km)"



class WSDUploadLog(models.Model):
    filename = models.CharField(max_length=255)
    uploaded_by = models.CharField(max_length=150, blank=True, null=True)
    site_count = models.IntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    is_base = models.BooleanField(default=False)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"{self.filename} ({self.site_count} sites) - {self.uploaded_at.strftime('%Y-%m-%d %H:%M')}"


class DailyAvailabilityUploadLog(models.Model):
    filename = models.CharField(max_length=255)
    uploaded_by = models.CharField(max_length=150, blank=True, null=True)
    records_count = models.IntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    date_range = models.CharField(max_length=100, blank=True, null=True)
    month_str = models.CharField(max_length=50, blank=True, null=True, db_index=True)
    start_date = models.CharField(max_length=20, blank=True, null=True)
    end_date = models.CharField(max_length=20, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    is_archived = models.BooleanField(default=False)
    is_base = models.BooleanField(default=False)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"Daily Availability: {self.filename} ({self.records_count} elements) [{self.month_str or 'N/A'}]"


class DailyAvailabilityRecord(models.Model):
    site_id = models.CharField(max_length=50, db_index=True)
    tech = models.CharField(max_length=10, db_index=True)  # 2G, 3G, 4G, 5G
    element_name = models.CharField(max_length=100, blank=True, null=True)
    state = models.CharField(max_length=50, db_index=True, blank=True, default='')
    region = models.CharField(max_length=50, db_index=True, blank=True, default='')
    lga = models.CharField(max_length=100, blank=True, default='')
    territory = models.CharField(max_length=100, db_index=True, blank=True, default='')
    tower_co = models.CharField(max_length=100, blank=True, default='')
    vendor = models.CharField(max_length=100, blank=True, default='')
    status = models.CharField(max_length=50, blank=True, default='')
    vvip = models.CharField(max_length=50, blank=True, default='')
    
    daily_scores = models.JSONField(default=dict, blank=True)
    avg_availability = models.FloatField(default=100.0, db_index=True)
    latest_availability = models.FloatField(default=100.0, db_index=True)
    
    upload_log = models.ForeignKey(DailyAvailabilityUploadLog, on_delete=models.SET_NULL, null=True, blank=True, related_name='records')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('upload_log', 'site_id', 'tech')
        ordering = ['site_id', 'tech']

    def __str__(self):
        return f"{self.site_id} [{self.tech}] - Avg: {self.avg_availability:.2f}%"


class HourlyAvailabilityUploadLog(models.Model):
    filename = models.CharField(max_length=255)
    uploaded_by = models.CharField(max_length=150, blank=True, null=True)
    records_count = models.IntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    date_str = models.CharField(max_length=100, blank=True, null=True)
    hours_list = models.JSONField(default=list, blank=True)
    national_regional_data = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    is_base = models.BooleanField(default=False)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"Hourly Availability: {self.filename} ({self.records_count} elements)"


class HourlyAvailabilityRecord(models.Model):
    site_id = models.CharField(max_length=50, db_index=True)
    tech = models.CharField(max_length=10, db_index=True)  # 2G, 3G, 4G, 5G
    element_name = models.CharField(max_length=100, blank=True, null=True)
    site_name = models.CharField(max_length=255, blank=True, null=True)
    state = models.CharField(max_length=50, db_index=True, blank=True, default='')
    region = models.CharField(max_length=50, db_index=True, blank=True, default='')
    lga = models.CharField(max_length=100, blank=True, default='')
    territory = models.CharField(max_length=100, blank=True, default='')
    tower_co = models.CharField(max_length=100, blank=True, default='')
    area_name = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(max_length=50, blank=True, default='')
    
    hourly_scores = models.JSONField(default=dict, blank=True)
    avg_availability = models.FloatField(default=100.0, db_index=True)
    latest_availability = models.FloatField(default=100.0, db_index=True)
    latest_hour = models.CharField(max_length=20, blank=True, default='')
    
    upload_log = models.ForeignKey(HourlyAvailabilityUploadLog, on_delete=models.SET_NULL, null=True, blank=True, related_name='records')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('site_id', 'tech')
        ordering = ['site_id', 'tech']

    def __str__(self):
        return f"{self.site_id} [{self.tech}] Hourly - Avg: {self.avg_availability:.2f}%"


class CellSector(models.Model):
    """
    Represents 4G/5G RF Cell Sectors extracted from KML datasets
    Contains antenna azimuths, PCIs, TACs, Cell IDs, and polygon coverage coordinates.
    """
    site_id = models.CharField(max_length=50, db_index=True)
    site_ref = models.ForeignKey(Site, on_delete=models.SET_NULL, null=True, blank=True, related_name='cell_sectors')
    tech = models.CharField(max_length=10, default='4G', db_index=True)
    cell_name = models.CharField(max_length=100, db_index=True)
    cell_id = models.IntegerField(null=True, blank=True)
    pci = models.IntegerField(null=True, blank=True, db_index=True)
    tac = models.IntegerField(null=True, blank=True)
    azimuth = models.FloatField(null=True, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    polygon_coords = models.JSONField(default=list, blank=True)
    region = models.CharField(max_length=50, default='Abuja Region', db_index=True)
    source_kml = models.CharField(max_length=255, default='ABUJA REGION KML 07292026 (4G).kml')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['site_id', 'cell_name']
        indexes = [
            models.Index(fields=['site_id', 'tech']),
            models.Index(fields=['pci']),
            models.Index(fields=['latitude', 'longitude']),
        ]

    def __str__(self):
        return f"{self.site_id} - {self.cell_name} (PCI: {self.pci}, Az: {self.azimuth}°)"


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    phone_number = models.CharField(max_length=50, blank=True, default='')
    job_title = models.CharField(max_length=150, blank=True, default='')
    company = models.CharField(max_length=150, blank=True, default='')
    bio = models.TextField(blank=True, default='')
    whatsapp_number = models.CharField(max_length=50, blank=True, default='')
    department = models.CharField(max_length=100, blank=True, default='Network Operations')
    preferred_language = models.CharField(max_length=20, default='en')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['user__username']

    def __str__(self):
        return f"Profile: {self.user.username} ({self.user.get_full_name() or self.user.username})"

    @property
    def avatar_url(self):
        if self.avatar and hasattr(self.avatar, 'url'):
            return self.avatar.url
        return None

