from django.db import models

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
