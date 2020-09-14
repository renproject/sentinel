import moment from "moment";

export const alreadyPast = (expiry: number) => {
    return moment.unix(expiry).isBefore(moment.now());
};

/**
 * Converts a timestamp to the number of hours, minutes or seconds from now,
 * showing "Expired" if the timestamp has already passed.
 *
 * @param expiry the time to countdown to as a unix timestamp in seconds
 * @returns a JSX span element with the time remaining and a unit
 */
const naturalTime = (
    expiry: number,
    options: {
        message: string;
        suffix?: string;
        prefix?: string;
        countDown: boolean;
        showingSeconds?: boolean;
        abbreviate?: boolean;
    },
): string => {
    const diff = options.countDown
        ? moment.duration(moment.unix(expiry).diff(moment()))
        : moment.duration(moment().diff(moment.unix(expiry)));
    let days = diff.asDays();
    let hours = diff.asHours();
    let minutes = diff.asMinutes();
    let seconds = diff.asSeconds();

    const suffix = options.suffix ? ` ${options.suffix}` : "";
    const prefix = options.prefix ? `${options.prefix} ` : "";

    if (days > 2) {
        days = Math.round(days);
        return `${prefix}${days} ${days === 1 ? "day" : "days"}${suffix}`;
    }
    if (hours >= 1) {
        // Round to the closest hour
        hours = Math.round(hours);
        return `${prefix}${hours} ${hours === 1 ? "hour" : "hours"}${suffix}`;
    } else if (minutes >= 1) {
        minutes = Math.round(minutes);
        if (options.abbreviate) {
            return `${prefix}${minutes} ${
                minutes === 1 ? "min" : "mins"
            }${suffix}`;
        }
        return `${prefix}${minutes} ${
            minutes === 1 ? "minute" : "minutes"
        }${suffix}`;
    } else if (options.showingSeconds && seconds >= 1) {
        seconds = Math.floor(seconds);
        if (options.abbreviate) {
            return `${prefix}${seconds} ${
                seconds === 1 ? "sec" : "secs"
            }${suffix}`;
        }
        return `${prefix}${seconds} ${
            seconds === 1 ? "second" : "seconds"
        }${suffix}`;
    } else {
        return `${options.message}`;
    }
};

export const timeAgo = (unixTime: number) => {
    return naturalTime(unixTime, {
        message: "Just now",
        suffix: "ago",
        countDown: false,
    });
};

export const timeDifference = (unixDifference: number) => {
    if (unixDifference > 0) {
        return naturalTime(moment().unix() - unixDifference, {
            message: "At the same time",
            suffix: "after",
            countDown: false,
        });
    } else {
        return naturalTime(moment().unix() - -unixDifference, {
            message: "At the same time",
            suffix: "before",
            countDown: false,
        });
    }
};
