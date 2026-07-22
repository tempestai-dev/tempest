export function DatabaseSection() {
  return (
    <div className="sp-section">
      <div className="sp-section-heading">Database Isolation</div>
      <p className="sp-section-desc">
        Database isolation is configured per project. Open any project's settings
        (the cog icon on the project row) and go to <strong>Database</strong> to set up a
        base image and enable isolation for that project.
      </p>
    </div>
  );
}
